"""
Analytics derived from stored Transaction rows (manual + CSV). Amounts are numeric; currency display is frontend (INR).
"""
from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from .models import Transaction


def _d(x) -> Decimal:
    if x is None:
        return Decimal("0")
    return Decimal(str(x))


def _month_key(d: date) -> str:
    return d.strftime("%Y-%m")


def _short_month(d: date) -> str:
    return d.strftime("%b")


def revenue_component(t: Transaction) -> Decimal:
    if (t.transaction_type or "").strip() == "Revenue":
        return max(_d(t.amount), Decimal("0"))
    return Decimal("0")


def expense_outflow(t: Transaction) -> Decimal:
    """Positive number = cash spent (Expense type, amount usually negative)."""
    if (t.transaction_type or "").strip() != "Expense":
        return Decimal("0")
    a = _d(t.amount)
    return abs(a)


def cash_in_out(t: Transaction) -> tuple[Decimal, Decimal]:
    """Net cash flow components: inflows (positive amounts), outflows (abs of negative)."""
    a = _d(t.amount)
    if a > 0:
        return a, Decimal("0")
    if a < 0:
        return Decimal("0"), abs(a)
    return Decimal("0"), Decimal("0")


def is_marketing_expense(t: Transaction) -> bool:
    if (t.transaction_type or "").strip() != "Expense":
        return False
    blob = f"{t.category or ''} {t.notes or ''} {t.entity_name or ''}".lower()
    keys = (
        "marketing",
        "advertising",
        "sales",
        "acquisition",
        "promo",
        "campaign",
        "seo",
        "ads",
    )
    return any(k in blob for k in keys)


def resolve_date_range(preset: str, start_s: str | None, end_s: str | None) -> tuple[date, date]:
    today = timezone.now().date()
    preset = (preset or "last_6_months").strip().lower()

    if preset == "ytd":
        return date(today.year, 1, 1), today

    if preset == "custom" and start_s and end_s:
        try:
            y1, m1, d1 = (int(x) for x in start_s.split("-"))
            y2, m2, d2 = (int(x) for x in end_s.split("-"))
            start = date(y1, m1, d1)
            end = date(y2, m2, d2)
            if start > end:
                start, end = end, start
            return start, end
        except (ValueError, TypeError):
            pass

    # last_6_months: calendar months inclusive (approx 6 full months back from month start)
    end = today
    y, m = end.year, end.month
    m -= 5
    while m < 1:
        m += 12
        y -= 1
    start = date(y, m, 1)
    return start, end


def prior_window(start: date, end: date) -> tuple[date, date]:
    days = (end - start).days + 1
    prior_end = start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=days - 1)
    return prior_start, prior_end


def iter_months(start: date, end: date):
    y, m = start.year, start.month
    while True:
        cur = date(y, m, 1)
        if cur > end:
            break
        last_day = monthrange(y, m)[1]
        seg_start = max(start, date(y, m, 1))
        seg_end = min(end, date(y, m, last_day))
        if seg_start <= seg_end:
            yield y, m, seg_start, seg_end
        m += 1
        if m > 12:
            m = 1
            y += 1


def build_analytics_for_user(user, preset: str, start_s: str | None, end_s: str | None) -> dict:
    start, end = resolve_date_range(preset, start_s, end_s)
    prior_start, prior_end = prior_window(start, end)

    qs_all = Transaction.objects.filter(user=user).order_by("date")
    qs_period = qs_all.filter(date__gte=start, date__lte=end)
    qs_prior = qs_all.filter(date__gte=prior_start, date__lte=prior_end)

    gross_revenue = Decimal("0")
    total_expense = Decimal("0")
    cash_in = Decimal("0")
    cash_out = Decimal("0")
    marketing_spend = Decimal("0")
    revenue_entities: set[str] = set()

    monthly_rev: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    monthly_exp: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    expense_by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))

    for t in qs_period:
        gross_revenue += revenue_component(t)
        te = expense_outflow(t)
        total_expense += te
        ci, co = cash_in_out(t)
        cash_in += ci
        cash_out += co
        if is_marketing_expense(t):
            marketing_spend += te
        if (t.transaction_type or "").strip() == "Revenue" and _d(t.amount) > 0:
            revenue_entities.add((t.entity_name or "").strip() or "Unknown")

        mk = _month_key(t.date)
        monthly_rev[mk] += revenue_component(t)
        monthly_exp[mk] += expense_outflow(t)
        if te > 0:
            cat = (t.category or "").strip() or "Uncategorized"
            expense_by_category[cat] += te

    net_cash_flow = cash_in - cash_out

    new_customer_count = len(revenue_entities)
    if marketing_spend > 0 and new_customer_count > 0:
        customer_acquisition_cost = marketing_spend / new_customer_count
    else:
        customer_acquisition_cost = None

    monthly_trend = []
    for y, m, seg_start, seg_end in iter_months(start, end):
        mk = f"{y:04d}-{m:02d}"
        rev = monthly_rev.get(mk, Decimal("0"))
        exp = monthly_exp.get(mk, Decimal("0"))
        profit = rev - exp
        monthly_trend.append(
            {
                "month": _short_month(seg_start),
                "month_key": mk,
                "revenue": float(rev),
                "expenses": float(exp),
                "profit": float(profit),
            }
        )

    expense_allocation = []
    if total_expense > 0:
        for cat, amt in sorted(expense_by_category.items(), key=lambda x: -x[1]):
            pct = float((amt / total_expense) * 100)
            expense_allocation.append(
                {
                    "category": cat,
                    "amount": float(amt),
                    "percentage": round(pct, 1),
                }
            )

    # --- Anomalies (data-driven) ---
    anomalies: list[dict] = []

    prior_gross_revenue = Decimal("0")
    for t in qs_prior:
        prior_gross_revenue += revenue_component(t)
    prior_total_exp = sum(expense_outflow(t) for t in qs_prior)
    period_total_exp = total_expense
    if prior_total_exp > 0 and period_total_exp > prior_total_exp * Decimal("1.35"):
        anomalies.append(
            {
                "severity": "high",
                "title": "Total expenses rose sharply vs prior period",
                "category": "All expenses",
                "amount": float(period_total_exp - prior_total_exp),
                "period_label": f"{start.isoformat()} – {end.isoformat()}",
                "explanation": (
                    f"Total outflows in this range are about "
                    f"{float((period_total_exp / prior_total_exp - 1) * 100):.0f}% higher than the immediately preceding period of equal length."
                ),
            }
        )

    prior_cat: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    for t in qs_prior:
        te = expense_outflow(t)
        if te > 0:
            cat = (t.category or "").strip() or "Uncategorized"
            prior_cat[cat] += te

    for cat, amt in expense_by_category.items():
        p = prior_cat.get(cat, Decimal("0"))
        if p > 0 and amt > p * Decimal("1.5"):
            anomalies.append(
                {
                    "severity": "medium",
                    "title": f"Spike in “{cat}” vs prior period",
                    "category": cat,
                    "amount": float(amt - p),
                    "period_label": f"{start.isoformat()} – {end.isoformat()}",
                    "explanation": (
                        f"Spend on {cat} is significantly above the prior window baseline, "
                        f"which may indicate a one-off charge, seasonality, or a new cost driver."
                    ),
                }
            )

    # Large single expense vs period average ticket
    exp_tx = [t for t in qs_period if expense_outflow(t) > 0]
    if len(exp_tx) >= 3:
        amounts = [expense_outflow(t) for t in exp_tx]
        avg = sum(amounts) / len(amounts)
        for t in exp_tx:
            te = expense_outflow(t)
            if te > avg * Decimal("3") and te > avg + Decimal("5000"):
                anomalies.append(
                    {
                        "severity": "low",
                        "title": f"Unusually large expense: {t.entity_name or 'Entry'}",
                        "category": (t.category or "").strip() or "Uncategorized",
                        "amount": float(te),
                        "period_label": t.date.isoformat(),
                        "explanation": (
                            f"This outlier ({float(te):,.2f}) is much larger than the typical expense "
                            f"in the selected range (average ≈ {float(avg):,.2f})."
                        ),
                    }
                )
                break

    if not anomalies and qs_period.exists():
        anomalies.append(
            {
                "severity": "low",
                "title": "No strong anomalies detected",
                "category": "—",
                "amount": 0.0,
                "period_label": f"{start.isoformat()} – {end.isoformat()}",
                "explanation": (
                    "Based on your uploaded and manual transactions, expense patterns look stable "
                    "relative to the prior window. Add more history for richer detection."
                ),
            }
        )

    avg_margin = Decimal("0")
    if gross_revenue > 0:
        avg_margin = ((gross_revenue - total_expense) / gross_revenue) * 100

    revenue_change_vs_prior_pct = None
    if prior_gross_revenue > 0:
        revenue_change_vs_prior_pct = float(
            ((gross_revenue - prior_gross_revenue) / prior_gross_revenue) * 100
        )

    return {
        "range": {
            "preset": preset,
            "start": start.isoformat(),
            "end": end.isoformat(),
        },
        "revenue_change_vs_prior_pct": revenue_change_vs_prior_pct,
        "gross_revenue": float(gross_revenue),
        "total_expense": float(total_expense),
        "net_cash_flow": float(net_cash_flow),
        "customer_acquisition_cost": float(customer_acquisition_cost)
        if customer_acquisition_cost is not None
        else None,
        "customer_acquisition_note": (
            "Marketing-related expenses ÷ distinct revenue counterparties in range."
            if new_customer_count
            else "Add revenue entries with distinct entities and tag marketing spend in category/notes to estimate CAC."
        ),
        "new_customer_count": new_customer_count,
        "marketing_spend": float(marketing_spend),
        "monthly_trend": monthly_trend,
        "expense_allocation": expense_allocation,
        "anomalies": anomalies[:8],
        "avg_profit_margin_pct": float(avg_margin),
    }
