"""
Operational Performance from stored Transaction rows (manual + CSV).
Uses the same date presets as analytics (last_6_months, ytd, custom).
Maps ledger fields to operational KPIs without schema changes.
"""
from __future__ import annotations

from datetime import datetime, time
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from .analytics_service import prior_window, resolve_date_range, revenue_component
from .models import Transaction


def _parse_amount(val) -> Decimal:
    if val is None:
        return Decimal("0")
    try:
        return Decimal(str(val))
    except Exception:
        return Decimal("0")


def _safe_status(t: Transaction) -> str:
    return (t.status or "").strip().upper()


def _safe_type(t: Transaction) -> str:
    return (t.transaction_type or "").strip()


def _blob(t: Transaction) -> str:
    return f"{t.notes or ''} {t.category or ''} {t.entity_name or ''}".lower()


COMPLETED_STATUSES = frozenset(
    {"CLEARED", "COMPLETED", "SUCCESS", "DONE", "FULFILLED", "PAID", "SETTLED"}
)
REJECTED_STATUSES = frozenset(
    {"FAILED", "REJECTED", "CANCELLED", "CANCELED", "DENIED", "REFUNDED", "VOIDED", "DECLINED"}
)

REJECT_KEYWORDS = (
    "reject",
    "rejected",
    "cancel",
    "cancelled",
    "canceled",
    "refund",
    "void",
    "chargeback",
    "failed",
    "denied",
    "rto",
    "return",
)


def _is_rejected_row(t: Transaction) -> bool:
    if _safe_status(t) in REJECTED_STATUSES:
        return True
    b = _blob(t)
    return any(k in b for k in REJECT_KEYWORDS)


def _counts_for_ops_row(t: Transaction) -> bool:
    """Revenue/Expense lines drive order-like ops; transfers excluded from order counts."""
    typ = _safe_type(t)
    return typ in ("Revenue", "Expense")


def _processing_hours(t: Transaction) -> float:
    """
    Proxy for processing time: hours from start-of transaction date to created_at.
    Same calendar day → small positive floor; long gaps capped (e.g. bulk import).
    """
    try:
        if settings.USE_TZ:
            start = timezone.make_aware(datetime.combine(t.date, time.min))
        else:
            start = datetime.combine(t.date, time.min)
        created = t.created_at
        if timezone.is_naive(created) and settings.USE_TZ:
            created = timezone.make_aware(created)
        delta = created - start
        hrs = max(0.0, delta.total_seconds() / 3600.0)
        if hrs < 1.0:
            return 1.0
        if hrs > 24 * 45:
            return 24.0
        return float(min(hrs, 24.0 * 14))
    except Exception:
        return 8.0


def build_operations_for_user(
    user,
    preset: str,
    start_s: str | None,
    end_s: str | None,
) -> dict:
    today = timezone.now().date()
    start, end = resolve_date_range(preset, start_s, end_s)
    prior_start, prior_end = prior_window(start, end)

    qs_period = list(
        Transaction.objects.filter(user=user, date__gte=start, date__lte=end).order_by("date", "id")
    )
    qs_prior = list(
        Transaction.objects.filter(user=user, date__gte=prior_start, date__lte=prior_end).order_by(
            "date", "id"
        )
    )

    # Weekday: Mon=0 … Sun=6 — volume = all rows; revenue = Revenue component per weekday
    volume_by_day: dict[int, int] = {i: 0 for i in range(7)}
    revenue_by_day: dict[int, float] = {i: 0.0 for i in range(7)}

    orders_completed = 0
    orders_rejected = 0
    late_fulfillment = 0
    total_operational = 0
    proc_times: list[float] = []

    for t in qs_period:
        wd = t.date.weekday()
        volume_by_day[wd] += 1

        rev_amt = revenue_component(t)
        if rev_amt > 0:
            revenue_by_day[wd] += float(rev_amt)

        if not _counts_for_ops_row(t):
            continue

        total_operational += 1
        st = _safe_status(t)
        typ = _safe_type(t)
        amt = _parse_amount(t.amount)

        if typ == "Revenue" and amt > 0:
            if st in COMPLETED_STATUSES:
                orders_completed += 1
                proc_times.append(_processing_hours(t))
                if "late" in _blob(t):
                    late_fulfillment += 1
            elif _is_rejected_row(t):
                orders_rejected += 1
            elif st == "PENDING" and t.date < today:
                late_fulfillment += 1

        elif typ == "Expense":
            if _is_rejected_row(t) or st in REJECTED_STATUSES:
                orders_rejected += 1

    # Prior period — same rules for growth / processing trend
    prior_total_operational = 0
    prior_proc_times: list[float] = []

    for t in qs_prior:
        if not _counts_for_ops_row(t):
            continue
        prior_total_operational += 1
        typ = _safe_type(t)
        amt = _parse_amount(t.amount)
        st = _safe_status(t)
        if typ == "Revenue" and amt > 0 and st in COMPLETED_STATUSES:
            prior_proc_times.append(_processing_hours(t))

    if prior_total_operational > 0:
        growth_rate = round(
            ((total_operational - prior_total_operational) / prior_total_operational) * 100, 1
        )
    else:
        growth_rate = 100.0 if total_operational > 0 else 0.0

    total_fulfilled = orders_completed
    on_time = max(0, orders_completed - late_fulfillment)
    if total_fulfilled > 0:
        fulfillment_efficiency = round((on_time / total_fulfilled) * 100, 1)
    elif total_operational == 0:
        fulfillment_efficiency = 0.0
    else:
        fulfillment_efficiency = 100.0

    avg_proc = round(sum(proc_times) / len(proc_times), 1) if proc_times else 0.0
    prior_avg_proc = round(sum(prior_proc_times) / len(prior_proc_times), 1) if prior_proc_times else 0.0

    if prior_avg_proc == 0:
        proc_trend = "stable"
    elif avg_proc < prior_avg_proc - 0.5:
        proc_trend = "improvement"
    elif avg_proc > prior_avg_proc + 0.5:
        proc_trend = "decline"
    else:
        proc_trend = "stable"

    day_names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    velocity_graph = [
        {
            "day": day_names[i],
            "volume": volume_by_day[i],
            "revenue": round(revenue_by_day[i], 2),
        }
        for i in range(7)
    ]

    rejection_rate = (orders_rejected / total_operational * 100) if total_operational > 0 else 0.0
    late_pct = (late_fulfillment / total_operational * 100) if total_operational > 0 else 0.0

    issues: list[str] = []
    recommendations: list[str] = []

    if rejection_rate > 15:
        issues.append("high_rejection")
        recommendations.append(
            f"Rejection or cancellation signals affect {rejection_rate:.1f}% of operational lines. "
            "Review statuses, categories, and notes on failed/cancelled flows."
        )
    elif rejection_rate > 5:
        issues.append("moderate_rejection")
        recommendations.append(
            f"Rejection/cancellation rate is {rejection_rate:.1f}%. Audit recent flagged rows and "
            "tighten upstream validation."
        )

    if late_pct > 20:
        issues.append("high_late")
        recommendations.append(
            f"Late or overdue items are about {late_pct:.1f}% of operational volume. "
            "Clear pending revenue dated in the past or add SLA follow-ups."
        )
    elif late_pct > 10:
        issues.append("moderate_late")
        recommendations.append(
            f"Late/overdue share is {late_pct:.1f}%. Focus on oldest pending revenue lines first."
        )

    if fulfillment_efficiency < 70 and orders_completed > 0:
        issues.append("low_efficiency")
        recommendations.append(
            f"On-time fulfillment is {fulfillment_efficiency}% of completed revenue lines. "
            "Tag late deliveries in notes only when true to keep this metric accurate."
        )
    elif fulfillment_efficiency < 85 and orders_completed > 0:
        issues.append("weak_efficiency")
        recommendations.append(
            f"Fulfillment efficiency is {fulfillment_efficiency}%. Reduce backlog of pending or late revenue rows."
        )

    if proc_trend == "decline" and prior_avg_proc > 0:
        issues.append("slow_processing")
        recommendations.append(
            f"Average processing proxy rose to {avg_proc}h from {prior_avg_proc}h. "
            "Check data entry lag vs transaction dates."
        )

    if growth_rate < -10:
        issues.append("declining_growth")
        recommendations.append(
            f"Operational line volume fell {abs(growth_rate):.1f}% vs the prior window. "
            "Confirm imports and period filter."
        )
    elif growth_rate < 0:
        issues.append("weak_growth")
        recommendations.append(
            "Operational volume is slightly below the prior window—monitor for sustained decline."
        )

    total_vol = sum(volume_by_day.values())
    total_rev = sum(revenue_by_day.values())
    if total_vol > 5 and total_rev == 0:
        issues.append("no_revenue")
        recommendations.append(
            "Weekday volume exists but no positive Revenue amounts in range—add revenue rows for velocity."
        )

    critical = {"high_rejection", "low_efficiency", "declining_growth"}
    warning = {
        "moderate_rejection",
        "high_late",
        "weak_efficiency",
        "slow_processing",
        "weak_growth",
        "no_revenue",
    }

    if total_operational == 0 and not qs_period:
        status_label = "No Data"
        summary = (
            "No transactions in this period. Use Last 6 Months, YTD, or Custom range, or add/import data."
        )
        recommendations = []
    elif total_operational == 0 and qs_period:
        status_label = "No Data"
        summary = "No Revenue/Expense operational lines in range (only transfers or empty types)."
        recommendations = [
            "Add Revenue and Expense transactions for the selected period to populate operational KPIs.",
        ]
    else:
        if any(i in critical for i in issues):
            status_label = "At Risk"
        elif any(i in warning for i in issues):
            status_label = "Needs Attention"
        elif issues:
            status_label = "Stable"
        elif fulfillment_efficiency >= 90 and rejection_rate <= 3 and growth_rate >= 0:
            status_label = "Optimal"
            recommendations.append(
                "Operations look efficient versus your ledger. Document this baseline and keep statuses current."
            )
        elif rejection_rate <= 5 and late_pct <= 10:
            status_label = "Efficient"
            recommendations.append(
                "Key metrics are healthy. Continue reconciling PENDING revenue promptly."
            )
        else:
            status_label = "Stable"

        trend_phrase = {
            "improvement": "Processing proxy is improving vs the prior period.",
            "decline": "Processing proxy increased vs the prior period.",
            "stable": "Processing proxy is stable vs the prior period.",
        }[proc_trend]
        summary = (
            f"{total_operational} operational lines (Revenue/Expense). "
            f"{orders_completed} revenue lines cleared, {orders_rejected} rejections/cancellations flagged, "
            f"{late_fulfillment} late/overdue. {trend_phrase}"
        )

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "range_preset": (preset or "last_6_months").strip().lower(),
        "orders_completed": orders_completed,
        "orders_rejected": orders_rejected,
        "late_fulfillment": late_fulfillment,
        "total_operational": total_operational,
        "growth_rate": growth_rate,
        "fulfillment_efficiency": fulfillment_efficiency,
        "avg_processing_time_hours": avg_proc,
        "prior_avg_processing_time_hours": prior_avg_proc,
        "processing_time_trend": proc_trend,
        "velocity_graph": velocity_graph,
        "strategy": {
            "status": status_label,
            "recommendations": recommendations[:8],
            "summary": summary,
        },
    }
