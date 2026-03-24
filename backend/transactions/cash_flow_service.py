"""
Cash movement / liquidity metrics from stored Transaction rows (same pipeline as analytics).
Inflow/outflow follow signed amount convention: positive = inflow, negative = outflow (see cash_in_out).
Receivable = Revenue + PENDING. Payable = Expense + PENDING.
"""
from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from .analytics_service import (
    cash_in_out,
    iter_months,
    prior_window,
    resolve_date_range,
    _d,
    _month_key,
    _short_month,
)
from .models import Transaction


def expense_abs(t: Transaction) -> Decimal:
    if (t.transaction_type or "").strip() != "Expense":
        return Decimal("0")
    return abs(_d(t.amount))


def _fmt_month_comparison(current: Decimal, prior: Decimal) -> tuple[str, str]:
    """Returns (label, headline_fragment) for momentum."""
    if prior == 0 and current == 0:
        return "stable", "stable liquidity with no recorded movement yet"
    if prior == 0 and current > 0:
        return "positive", "positive momentum as inflows exceed outflows this month"
    if prior == 0 and current < 0:
        return "negative", "negative momentum with net cash outflow this month"
    delta = current - prior
    if delta > prior * Decimal("0.1") and current > 0:
        return "positive", "positive momentum versus the prior month"
    if delta < -prior * Decimal("0.1") or current < prior:
        if current < 0:
            return "negative", "declining liquidity versus the prior month"
        return "negative", "weaker net movement compared to the prior month"
    if current >= 0 and prior >= 0:
        return "stable", "healthy, stable liquidity relative to last month"
    return "stable", "liquidity is steady versus last month"


def _liquidity_status(
    inflow: Decimal,
    outflow: Decimal,
    net: Decimal,
    ar: Decimal,
    ap: Decimal,
) -> tuple[str, str]:
    """
    Returns (status_key, risk_exposure) where status_key is Healthy|Stable|Watchlist|At Risk.
    """
    if outflow <= 0 and inflow <= 0:
        return "Stable", "Low"

    ratio = Decimal("999") if outflow <= 0 else inflow / outflow

    # Payable pressure vs collectible
    ap_ar_stress = ap > 0 and ar > 0 and ap > ar * Decimal("1.4")
    severe_outflow = outflow > 0 and inflow < outflow * Decimal("0.85")
    if net < 0 and severe_outflow:
        return "At Risk", "High"
    if net < 0 or ratio < Decimal("0.92") or ap_ar_stress:
        return "Watchlist", "Medium"
    if net >= 0 and ratio >= Decimal("1.05") and not ap_ar_stress:
        return "Healthy", "Low"
    return "Stable", "Low"


def _detect_event_tag(t: Transaction) -> str:
    blob = f"{t.category or ''} {t.notes or ''} {t.entity_name or ''}".lower()
    if "payroll" in blob or "salary" in blob:
        return "Payroll"
    if "subscription" in blob or "saas" in blob or "aws" in blob:
        return "Recurring"
    if "invoice" in blob or "receivable" in blob:
        return "Receivable"
    if "vendor" in blob or "supplier" in blob:
        return "Vendor"
    st = (t.status or "").strip().upper()
    if st == "PENDING":
        return "Pending settlement"
    return (t.category or "").strip() or "Ledger"


def _build_optimization(
    inflow: Decimal,
    outflow: Decimal,
    net: Decimal,
    ar: Decimal,
    ap: Decimal,
    prior_net: Decimal,
    monthly_nets: list[Decimal],
) -> dict:
    strategies: list[str] = []
    if ap > ar and ap > 0:
        strategies.append(
            "Accelerate receivable collection and align payable due dates to close the "
            f"{float(ap - ar):,.0f} gap (same currency as your ledger) between payables and receivables."
        )
    if outflow > 0 and inflow < outflow * Decimal("1.05"):
        strategies.append(
            "Cash outflows are pressuring inflows—defer non-critical expenses and review "
            "discretionary spend for the next cycle."
        )
    if net < prior_net:
        strategies.append(
            "Net movement weakened versus the prior period—tighten month-end spend control "
            "and confirm large payments are planned."
        )
    if monthly_nets and len(monthly_nets) >= 2:
        if monthly_nets[-1] < monthly_nets[-2] < 0:
            strategies.append(
                "Two consecutive months of negative net movement—prioritize inflow-generating "
                "activities and reduce recurring cost where possible."
            )
    if ar > 0 and ar >= inflow * Decimal("0.5") and ar > 0:
        strategies.append(
            "Outstanding receivables are material—run invoice follow-ups and shorten payment terms "
            "on new sales."
        )

    has_issues = len(strategies) > 0
    if not has_issues:
        summary = (
            "Liquidity metrics are within a comfortable range for the selected period. "
            "Continue monitoring inflow timing and payable cycles."
        )
    else:
        summary = (
            "Based on your recorded transactions, a few liquidity levers stand out. "
            "Consider the actions below to stabilize cash."
        )
    return {
        "summary": summary,
        "strategies": strategies[:6],
        "has_issues": has_issues,
    }


def build_cash_flow_for_user(user, preset: str, start_s: str | None, end_s: str | None) -> dict:
    start, end = resolve_date_range(preset, start_s, end_s)
    prior_start, prior_end = prior_window(start, end)

    qs_all = Transaction.objects.filter(user=user)
    qs_period = qs_all.filter(date__gte=start, date__lte=end).order_by("date")
    qs_prior = qs_all.filter(date__gte=prior_start, date__lte=prior_end)

    total_inflow = Decimal("0")
    total_outflow = Decimal("0")
    monthly_in: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    monthly_out: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))

    for t in qs_period:
        ci, co = cash_in_out(t)
        total_inflow += ci
        total_outflow += co
        mk = _month_key(t.date)
        monthly_in[mk] += ci
        monthly_out[mk] += co

    prior_inflow = Decimal("0")
    prior_outflow = Decimal("0")
    for t in qs_prior:
        ci, co = cash_in_out(t)
        prior_inflow += ci
        prior_outflow += co

    prior_period_net = prior_inflow - prior_outflow
    net_movement = total_inflow - total_outflow

    net_change_vs_prior_pct = None
    if prior_period_net != 0:
        net_change_vs_prior_pct = float(
            ((net_movement - prior_period_net) / abs(prior_period_net)) * 100
        )

    # AR / AP (entire ledger — outstanding working capital)
    ar_total = Decimal("0")
    ar_count = 0
    ap_total = Decimal("0")
    ap_count = 0
    for t in qs_all:
        typ = (t.transaction_type or "").strip()
        st = (t.status or "").strip().upper()
        if st != "PENDING":
            continue
        if typ == "Revenue":
            amt = max(_d(t.amount), Decimal("0"))
            if amt > 0:
                ar_total += amt
                ar_count += 1
        elif typ == "Expense":
            ap_total += expense_abs(t)
            ap_count += 1

    # Cumulative position proxy (all cleared + pending movement by sign)
    position_proxy = Decimal("0")
    for t in qs_all:
        ci, co = cash_in_out(t)
        position_proxy += ci - co

    monthly_liquidity = []
    monthly_nets: list[Decimal] = []
    for y, m, seg_start, seg_end in iter_months(start, end):
        mk = f"{y:04d}-{m:02d}"
        inf = monthly_in.get(mk, Decimal("0"))
        ouf = monthly_out.get(mk, Decimal("0"))
        mn = inf - ouf
        monthly_nets.append(mn)
        monthly_liquidity.append(
            {
                "month": _short_month(seg_start),
                "month_key": mk,
                "inflow": float(inf),
                "outflow": float(ouf),
                "net": float(mn),
            }
        )

    today = timezone.now().date()
    cur_y, cur_m = today.year, today.month
    cur_start = date(cur_y, cur_m, 1)
    if cur_m == 12:
        cur_end = date(cur_y, 12, 31)
    else:
        cur_end = date(cur_y, cur_m + 1, 1) - timedelta(days=1)
    cur_end = min(cur_end, end)
    cur_start_eff = max(cur_start, start)

    if cur_m == 1:
        prev_y, prev_m = cur_y - 1, 12
    else:
        prev_y, prev_m = cur_y, cur_m - 1
    prev_start = date(prev_y, prev_m, 1)
    prev_end = date(prev_y, prev_m, calendar.monthrange(prev_y, prev_m)[1])

    def window_net(d0: date, d1: date) -> Decimal:
        inn = Decimal("0")
        out = Decimal("0")
        for t in qs_all.filter(date__gte=d0, date__lte=d1):
            ci, co = cash_in_out(t)
            inn += ci
            out += co
        return inn - out

    current_month_net = (
        window_net(cur_start_eff, min(cur_end, today)) if cur_start_eff <= min(cur_end, today) else Decimal("0")
    )
    prior_month_net = window_net(prev_start, prev_end)

    if not qs_period.exists():
        mom_label = "stable"
        mom_headline = "no transactions in this range—add or import data to see liquidity momentum"
        interpretation = "Upload or enter transactions to unlock cash movement insights."
    else:
        mom_label, mom_headline = _fmt_month_comparison(current_month_net, prior_month_net)
        interpretation = (
            f"Current month net cash movement is {float(current_month_net):,.2f} "
            f"vs prior month {float(prior_month_net):,.2f} (from your ledger, same currency as stored amounts)."
        )

    status, risk = _liquidity_status(total_inflow, total_outflow, net_movement, ar_total, ap_total)
    optimization = _build_optimization(
        total_inflow, total_outflow, net_movement, ar_total, ap_total, prior_period_net, monthly_nets
    )

    # Runway: position vs average monthly outflow in range
    month_out_vals = [monthly_out.get(f"{y:04d}-{m:02d}", Decimal("0")) for y, m, _, _ in iter_months(start, end)]
    if not month_out_vals:
        avg_mo = Decimal("0")
    else:
        avg_mo = sum(month_out_vals) / len(month_out_vals)
    runway_months = None
    if avg_mo > Decimal("0") and position_proxy > 0:
        runway_months = float(position_proxy / avg_mo)
        runway_months = min(runway_months, 120.0)

    runway_label = "Low Risk"
    if risk == "High":
        runway_label = "Elevated"
    elif risk == "Medium":
        runway_label = "Moderate"

    # Liquidity events (real rows)
    events: list[dict] = []
    seen_ids: set[int] = set()

    def add_event(t: Transaction, priority: int):
        if t.id in seen_ids:
            return
        ci, co = cash_in_out(t)
        if ci > 0:
            direction = "inflow"
            amt = float(ci)
        else:
            direction = "outflow"
            amt = float(co)
        if amt <= 0:
            return
        seen_ids.add(t.id)
        events.append(
            {
                "id": t.id,
                "title": (t.entity_name or "").strip() or "Transaction",
                "amount": amt,
                "direction": direction,
                "tag": _detect_event_tag(t),
                "date": t.date.isoformat(),
                "transaction_type": (t.transaction_type or "").strip(),
                "status": (t.status or "").strip(),
                "_p": priority,
            }
        )

    pending_qs = qs_period.filter(status__iexact="PENDING").order_by("-date")
    for t in pending_qs[:5]:
        add_event(t, 2)

    sorted_period = sorted(list(qs_period), key=lambda x: abs(_d(x.amount)), reverse=True)
    for t in sorted_period[:6]:
        mag = abs(_d(t.amount))
        if mag == 0:
            continue
        if t.id in seen_ids:
            continue
        add_event(t, 1)

    events.sort(key=lambda x: (-x["_p"], -x["amount"]))
    for e in events:
        del e["_p"]
    events = events[:8]

    if not events and not qs_period.exists():
        events = []

    return {
        "range": {
            "preset": preset,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "totals": {
            "cash_inflow": float(total_inflow),
            "cash_outflow": float(total_outflow),
            "net_movement": float(net_movement),
            "prior_period_net_movement": float(prior_period_net),
            "net_change_vs_prior_pct": net_change_vs_prior_pct,
        },
        "accounts_receivable": {"total": float(ar_total), "count": ar_count},
        "accounts_payable": {"total": float(ap_total), "count": ap_count},
        "liquidity_position_proxy": float(position_proxy),
        "monthly_liquidity": monthly_liquidity,
        "liquidity_status": status,
        "risk_exposure": risk,
        "momentum": {
            "label": mom_label,
            "headline": mom_headline,
            "current_month_net": float(current_month_net),
            "prior_month_net": float(prior_month_net),
            "interpretation": interpretation,
        },
        "runway": {
            "months": runway_months,
            "avg_monthly_outflow": float(avg_mo),
            "label": runway_label,
        },
        "liquidity_events": events,
        "optimization": optimization,
    }
