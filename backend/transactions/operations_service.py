"""
Operational Performance service.
Derives all KPIs from stored Transaction records (manual + CSV import).
No fake data — all metrics are computed from the actual dataset.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from .models import Transaction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    return (t.transaction_type or "").strip().title()


def _safe_notes(t: Transaction) -> str:
    return (t.notes or "").lower()


def _safe_category(t: Transaction) -> str:
    return (t.category or "").lower()


# ---------------------------------------------------------------------------
# Date range helpers (mirrors analytics_service logic)
# ---------------------------------------------------------------------------

def _resolve_date_range(preset: str, start_s: str | None, end_s: str | None) -> tuple[date, date]:
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

    # default: last 6 calendar months
    end = today
    y, m = end.year, end.month
    m -= 5
    while m < 1:
        m += 12
        y -= 1
    start = date(y, m, 1)
    return start, end


def _prior_window(start: date, end: date) -> tuple[date, date]:
    days = (end - start).days + 1
    prior_end = start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=days - 1)
    return prior_start, prior_end


# ---------------------------------------------------------------------------
# Operational classification helpers
# ---------------------------------------------------------------------------

COMPLETED_STATUSES = {"CLEARED", "COMPLETED", "SUCCESS", "DONE", "FULFILLED", "PAID"}
REJECTED_STATUSES = {"FAILED", "REJECTED", "CANCELLED", "DENIED", "REFUNDED", "VOIDED"}
PENDING_STATUSES = {"PENDING", "PROCESSING", "ON_HOLD"}

REVENUE_TYPES = {"Revenue", "Income", "Sale"}


def _is_operational(t: Transaction) -> bool:
    """Return True if this transaction counts as an operational record."""
    t_type = _safe_type(t)
    notes = _safe_notes(t)
    cat = _safe_category(t)
    # Revenue entries are always operational
    if t_type in REVENUE_TYPES:
        return True
    # Expense entries that refer to orders/operations
    if any(kw in notes for kw in ("order", "sale", "fulfil", "fulfill", "shipment", "delivery")):
        return True
    if any(kw in cat for kw in ("order", "sale", "operation")):
        return True
    return False


def _processing_hours(t: Transaction) -> float:
    """
    Estimate processing time in hours.
    Uses abs(created_at.date - transaction date) * 24.
    Caps at 48 h for bulk-imported historical records (diff > 30 days),
    uses 8 h minimum when same-day to avoid zero values.
    """
    try:
        diff_days = abs((t.created_at.date() - t.date).days)
    except Exception:
        return 8.0

    if diff_days == 0:
        return 8.0  # same-day processing baseline
    if diff_days > 30:
        return 24.0  # bulk-imported historical; cap at 1 day
    return float(diff_days) * 24.0


# ---------------------------------------------------------------------------
# Core builder
# ---------------------------------------------------------------------------

def build_operations_for_user(
    user,
    preset: str,
    start_s: str | None,
    end_s: str | None,
) -> dict:
    today = timezone.now().date()
    start, end = _resolve_date_range(preset, start_s, end_s)
    prior_start, prior_end = _prior_window(start, end)

    qs_period = list(Transaction.objects.filter(user=user, date__gte=start, date__lte=end))

    # Smart fallback: if no records in the requested window, use the actual dataset range
    if not qs_period:
        from django.db.models import Min, Max
        agg = Transaction.objects.filter(user=user).aggregate(
            min_date=Min('date'), max_date=Max('date')
        )
        if agg['min_date'] and agg['max_date']:
            start = agg['min_date']
            end   = agg['max_date']
            prior_start, prior_end = _prior_window(start, end)
            qs_period = list(Transaction.objects.filter(user=user, date__gte=start, date__lte=end))

    qs_prior = list(Transaction.objects.filter(user=user, date__gte=prior_start, date__lte=prior_end))

    # ------------------------------------------------------------------
    # Current-period metrics
    # ------------------------------------------------------------------
    orders_completed = 0
    orders_rejected = 0
    orders_pending_overdue = 0   # PENDING but date is in the past → late
    late_fulfillment = 0
    total_operational = 0

    proc_times: list[float] = []

    # Weekday buckets: 0=Mon … 6=Sun
    volume_by_day: dict[int, int] = {i: 0 for i in range(7)}
    revenue_by_day: dict[int, float] = {i: 0.0 for i in range(7)}

    for t in qs_period:
        if not _is_operational(t):
            continue

        total_operational += 1
        status = _safe_status(t)
        t_type = _safe_type(t)
        amt = _parse_amount(t.amount)
        weekday = t.date.weekday()  # 0=Mon

        # Volume always counted for operational records
        volume_by_day[weekday] += 1

        # Revenue velocity: only positive revenue-type records
        if t_type in REVENUE_TYPES and amt > 0:
            revenue_by_day[weekday] += float(amt)

        # Completion / rejection classification
        if status in COMPLETED_STATUSES:
            orders_completed += 1
            proc_times.append(_processing_hours(t))

            # Late fulfillment: only flag if explicitly noted in text.
            # We deliberately do NOT use created_at vs date diff for completed orders
            # because bulk-imported historical records have created_at = import date,
            # which would falsely mark every historical record as "late".
            if "late" in _safe_notes(t):
                late_fulfillment += 1

        elif status in REJECTED_STATUSES:
            orders_rejected += 1

        elif status in PENDING_STATUSES and t.date < today:
            # Overdue pending (genuinely late — still open past due date)
            orders_pending_overdue += 1
            late_fulfillment += 1

    # ------------------------------------------------------------------
    # Prior-period metrics (for trend calculations)
    # ------------------------------------------------------------------
    prior_completed = 0
    prior_total_operational = 0
    prior_proc_times: list[float] = []

    for t in qs_prior:
        if not _is_operational(t):
            continue
        prior_total_operational += 1
        status = _safe_status(t)
        if status in COMPLETED_STATUSES:
            prior_completed += 1
            prior_proc_times.append(_processing_hours(t))

    # ------------------------------------------------------------------
    # Growth rate (operational volume)
    # ------------------------------------------------------------------
    if prior_total_operational > 0:
        growth_rate = round(
            ((total_operational - prior_total_operational) / prior_total_operational) * 100, 1
        )
    else:
        growth_rate = 100.0 if total_operational > 0 else 0.0

    # ------------------------------------------------------------------
    # Fulfillment efficiency
    # ------------------------------------------------------------------
    total_fulfilled = orders_completed  # only cleared records count as fulfilled
    on_time = max(0, orders_completed - late_fulfillment)
    if total_fulfilled > 0:
        fulfillment_efficiency = round((on_time / total_fulfilled) * 100, 1)
    elif total_operational == 0:
        fulfillment_efficiency = 0.0
    else:
        fulfillment_efficiency = 100.0  # no fulfilled yet, no late either

    # ------------------------------------------------------------------
    # Average processing time
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Volume vs Revenue velocity graph (Mon → Sun)
    # ------------------------------------------------------------------
    day_names = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    velocity_graph = [
        {
            "day": day_names[i],
            "volume": volume_by_day[i],
            "revenue": round(revenue_by_day[i], 2),
        }
        for i in range(7)
    ]

    # ------------------------------------------------------------------
    # Strategy Intelligence Engine
    # ------------------------------------------------------------------
    rejection_rate = (orders_rejected / total_operational * 100) if total_operational > 0 else 0.0
    late_pct = (late_fulfillment / total_operational * 100) if total_operational > 0 else 0.0

    issues: list[str] = []
    recommendations: list[str] = []

    if rejection_rate > 15:
        issues.append("high_rejection")
        recommendations.append(
            f"Rejection rate is {rejection_rate:.1f}%. Review root causes: validation failures, "
            "supplier issues, or customer mismatch. Implement pre-submission checks to reduce failures."
        )
    elif rejection_rate > 5:
        issues.append("moderate_rejection")
        recommendations.append(
            f"Rejection rate of {rejection_rate:.1f}% is above target. Audit recent rejections "
            "and add process checkpoints to prevent repeat failures."
        )

    if late_pct > 20:
        issues.append("high_late")
        recommendations.append(
            f"Late fulfillment is at {late_pct:.1f}%. Investigate bottlenecks in the fulfilment "
            "pipeline. Consider SLA alerts and workload rebalancing across peak days."
        )
    elif late_pct > 10:
        issues.append("moderate_late")
        recommendations.append(
            f"Late fulfillment at {late_pct:.1f}%. Review scheduling and capacity on high-volume "
            "weekdays to improve on-time delivery."
        )

    if fulfillment_efficiency < 70:
        issues.append("low_efficiency")
        recommendations.append(
            f"Fulfillment efficiency is critically low at {fulfillment_efficiency}%. Streamline "
            "the processing pipeline and prioritise clearing the pending backlog."
        )
    elif fulfillment_efficiency < 85:
        issues.append("weak_efficiency")
        recommendations.append(
            f"Fulfillment efficiency at {fulfillment_efficiency}% is below target. "
            "Focus on reducing late completions to push this above 90%."
        )

    if proc_trend == "decline":
        issues.append("slow_processing")
        recommendations.append(
            f"Average processing time has increased to {avg_proc}h (was {prior_avg_proc}h). "
            "Identify the slowest stages and automate or parallelise where possible."
        )

    if growth_rate < -10:
        issues.append("declining_growth")
        recommendations.append(
            f"Operational volume dropped {abs(growth_rate):.1f}% vs the prior period. "
            "Investigate demand-side causes and activate re-engagement or acquisition campaigns."
        )
    elif growth_rate < 0:
        issues.append("weak_growth")
        recommendations.append(
            "Volume is slightly down compared to the prior period. Monitor closely and "
            "consider targeted outreach to stabilise operational load."
        )

    # Check revenue vs volume imbalance (high volume, low revenue)
    total_vol = sum(volume_by_day.values())
    total_rev = sum(revenue_by_day.values())
    if total_vol > 5 and total_rev == 0:
        issues.append("no_revenue")
        recommendations.append(
            "Operational volume is recorded but no revenue is associated. Ensure revenue "
            "transactions are properly categorised so velocity metrics reflect actual income."
        )

    # Determine status
    critical = {"high_rejection", "low_efficiency", "declining_growth"}
    warning = {"moderate_rejection", "high_late", "weak_efficiency", "slow_processing", "weak_growth"}

    if any(i in critical for i in issues):
        status_label = "At Risk"
    elif any(i in warning for i in issues):
        status_label = "Needs Attention"
    elif issues:
        status_label = "Stable"
    else:
        status_label = "Optimal"
        recommendations.append(
            "Operations are running at optimal efficiency. Consider documenting current "
            "workflows as a baseline and exploring automation to sustain performance at scale."
        )

    # Summary note
    trend_phrase = {
        "improvement": "Processing times are improving.",
        "decline": "Processing times are slowing down.",
        "stable": "Processing times are stable.",
    }[proc_trend]

    if total_operational == 0:
        summary = (
            "No operational records found for this period. Add transactions or import data "
            "to see performance metrics."
        )
        status_label = "No Data"
    else:
        summary = (
            f"{total_operational} operations recorded. "
            f"{orders_completed} completed, {orders_rejected} rejected, "
            f"{late_fulfillment} late. {trend_phrase}"
        )

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
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
            "recommendations": recommendations,
            "summary": summary,
        },
    }
