"""
Executive reports: composes existing analytics + cash-flow outputs (no duplicate ledger rules).
EBITDA (SME): operating revenue − operating expenses (no separate I/T/D&A in model).
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from .analytics_service import (
    build_analytics_for_user,
    expense_outflow,
    iter_months,
    prior_window,
    revenue_component,
)
from .cash_flow_service import build_cash_flow_for_user
from .models import Transaction


def _period_rev_exp(user, start: date, end: date) -> tuple[float, float]:
    qs = Transaction.objects.filter(user=user, date__gte=start, date__lte=end)
    rev = Decimal("0")
    exp = Decimal("0")
    for t in qs:
        rev += revenue_component(t)
        exp += expense_outflow(t)
    return float(rev), float(exp)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def build_reports_for_user(user, preset: str, start_s: str | None, end_s: str | None) -> dict:
    analytics = build_analytics_for_user(user, preset, start_s, end_s)
    cash = build_cash_flow_for_user(user, preset, start_s, end_s)

    gr = float(analytics.get("gross_revenue") or 0)
    te = float(analytics.get("total_expense") or 0)
    ncf = float(analytics.get("net_cash_flow") or 0)
    margin_pct = float(analytics.get("avg_profit_margin_pct") or 0)
    rev_growth = analytics.get("revenue_change_vs_prior_pct")

    start = date.fromisoformat(analytics["range"]["start"])
    end = date.fromisoformat(analytics["range"]["end"])
    n_months = max(1, sum(1 for _ in iter_months(start, end)))

    ebitda = gr - te
    ebitda_margin_pct = (ebitda / gr * 100.0) if gr > 0 else 0.0

    monthly_avg_revenue = gr / n_months
    monthly_avg_expense = te / n_months

    ar = float(cash.get("accounts_receivable", {}).get("total") or 0)
    ap = float(cash.get("accounts_payable", {}).get("total") or 0)
    wc_proxy = ar - ap

    prior_start, prior_end = prior_window(start, end)
    prior_rev, prior_exp = _period_rev_exp(user, prior_start, prior_end)
    exp_growth_pct = None
    if prior_exp > 0:
        exp_growth_pct = round(((te - prior_exp) / prior_exp) * 100, 1)

    burn_rate_monthly = monthly_avg_expense if ncf < 0 and te > 0 else None

    net_profit = ebitda
    if ebitda > 1e-6:
        pl_status = "profit"
        pl_headline = "Net operating result is positive for this period."
    elif ebitda < -1e-6:
        pl_status = "loss"
        pl_headline = "Net operating result is negative for this period."
    else:
        pl_status = "breakeven"
        pl_headline = "Revenue and expenses are approximately balanced."

    improving = False
    declining = False
    if rev_growth is not None:
        improving = rev_growth > 2
        declining = rev_growth < -2

    # Operating efficiency score (0–100): margin-heavy + cash + growth
    eff = _clamp(margin_pct * 2.5, 0, 50)
    if ncf >= 0:
        eff += 25
    else:
        eff += max(0, 25 + min(0, ncf / max(monthly_avg_expense, 1) * 5))
    if rev_growth is not None:
        if rev_growth >= 0:
            eff += min(25, 12 + rev_growth / 2)
        else:
            eff += max(0, 12 + rev_growth / 2)
    else:
        eff += 12
    operating_efficiency_score = round(_clamp(eff, 0, 100), 1)

    # Financial health score (0–100)
    hs = 40.0
    hs += _clamp(margin_pct, -20, 30)
    hs += 15 if ncf >= 0 else max(-15, min(0, ncf / max(gr, 1) * 30))
    hs += 10 if ebitda >= 0 else min(0, ebitda / max(te, 1) * 20)
    if ap > ar * 1.5 and ap > 0:
        hs -= 10
    elif ar >= ap:
        hs += 5
    if rev_growth is not None:
        hs += _clamp(rev_growth / 2, -15, 15)
    financial_health_score = round(_clamp(hs, 0, 100), 1)

    # Condition label
    if financial_health_score >= 78 and margin_pct >= 10 and ncf >= 0:
        fin_label = "Strong"
        fin_expl = (
            "Margins, cash movement, and the overall score suggest a resilient position "
            "for the selected period."
        )
    elif financial_health_score >= 62 and ebitda >= 0:
        fin_label = "Stable"
        fin_expl = (
            "The business is broadly stable: operating result is non-negative and key "
            "balances are manageable."
        )
    elif financial_health_score >= 45:
        fin_label = "Moderate"
        fin_expl = (
            "Performance is mixed—monitor expense growth, collections, and cash timing closely."
        )
    elif financial_health_score >= 28:
        fin_label = "Needs Attention"
        fin_expl = (
            "Several pressure signals appear (margin, cash, or growth). Prioritize corrective "
            "actions in the next cycle."
        )
    else:
        fin_label = "Financially At Risk"
        fin_expl = (
            "Multiple indicators are weak. Stabilize cash, reduce cost leakage, and improve "
            "record-keeping before expansion or external financing."
        )

    # Loan / readiness (internal insight only)
    lr_score = 0.0
    lr_factors: list[str] = []
    if gr > 0:
        lr_score += 20
        lr_factors.append("Recorded revenue in period supports visibility for reviewers.")
    else:
        lr_factors.append("Limited revenue in range—banks expect a clearer revenue trail.")
    if ebitda > 0:
        lr_score += 20
        lr_factors.append("Positive EBITDA (operating proxy) strengthens repayment narrative.")
    else:
        lr_factors.append("Negative EBITDA weakens conventional debt-service comfort.")
    if ncf >= 0:
        lr_score += 20
        lr_factors.append("Non-negative net cash flow improves liquidity story.")
    else:
        lr_factors.append("Negative net cash flow may concern lenders without mitigants.")
    if margin_pct >= 8:
        lr_score += 15
        lr_factors.append("Profit margin is in a presentable range for SME files.")
    elif margin_pct >= 0:
        lr_score += 8
        lr_factors.append("Margins are thin—expect scrutiny on cost control.")
    else:
        lr_factors.append("Negative margin signals stress in underwriting-style review.")
    if ap <= ar * 1.2 or ap == 0:
        lr_score += 10
        lr_factors.append("Payables are not dramatically larger than receivables.")
    else:
        lr_factors.append("Payable pressure vs receivables may need explanation.")
    if rev_growth is not None and rev_growth >= -5:
        lr_score += 10
        lr_factors.append("Revenue trajectory is not in free-fall versus prior window.")
    else:
        lr_factors.append("Revenue decline vs prior period warrants narrative support.")
    if exp_growth_pct is not None and rev_growth is not None and exp_growth_pct > rev_growth + 10:
        lr_score -= 10
        lr_factors.append("Expenses growing faster than revenue—flag for internal readiness.")

    lr_score = round(_clamp(lr_score, 0, 100), 1)
    if lr_score >= 72:
        lr_label = "Well prepared (internal view)"
    elif lr_score >= 55:
        lr_label = "Moderately prepared"
    elif lr_score >= 38:
        lr_label = "Needs improvement before financing"
    else:
        lr_label = "High preparation gap"

    # Executive narrative
    rev_sentence = (
        f"Total recorded revenue for this window is {gr:,.2f} (same currency as stored amounts)."
        if gr
        else "No revenue was recorded in this period."
    )
    exp_sentence = (
        f"Operating expenses captured total {te:,.2f}."
        if te
        else "No expense lines were recorded."
    )
    cash_sentence = (
        "Net cash movement (signed inflows vs outflows) is positive."
        if ncf >= 0
        else "Net cash movement is negative—liquidity may need active management."
    )
    growth_sentence = (
        f"Revenue vs the prior comparable window changed by {rev_growth:+.1f}%."
        if rev_growth is not None
        else "Insufficient prior-period revenue to score growth."
    )
    stability = (
        "Expenses appear contained relative to revenue."
        if gr > 0 and te <= gr * 1.05
        else "Expense pressure is elevated relative to revenue."
        if gr > 0
        else "Add revenue and expense data to judge stability."
    )

    paragraphs = [
        f"{pl_headline} {rev_sentence} {exp_sentence}",
        f"{growth_sentence} {cash_sentence} {stability}",
        f"Working-capital snapshot (receivables − payables proxy): {wc_proxy:,.2f}. "
        f"Financial health score: {financial_health_score}/100 ({fin_label}).",
    ]

    # Recommendations (data-driven)
    recs: list[str] = []
    if gr == 0 and te == 0:
        recs.append("Import or enter transactions for this period to generate a full report.")
    if ebitda < 0 and te > 0:
        recs.append(
            "Improve EBITDA by trimming the largest expense categories shown in allocation, "
            "or lifting revenue throughput."
        )
    if ncf < 0:
        recs.append(
            "Address negative net cash flow: accelerate collections on pending revenue and "
            "phase non-critical outflows."
        )
    if ap > ar and ap > 0:
        recs.append(
            "Payables exceed receivables—negotiate terms or align collections before "
            "seeking external credit."
        )
    if rev_growth is not None and rev_growth < -10:
        recs.append(
            "Revenue is down materially vs the prior window—stabilize the sales pipeline before "
            "expansion plans."
        )
    if exp_growth_pct is not None and exp_growth_pct > 15 and (rev_growth is None or exp_growth_pct > rev_growth + 5):
        recs.append(
            "Expense growth outpaces revenue—freeze discretionary spend and reforecast the quarter."
        )
    if margin_pct < 5 and gr > 0:
        recs.append(
            "Profit margin is thin—focus on pricing, COGS-like expense categories, and mix."
        )
    if not recs:
        recs.append(
            "Maintain current discipline: keep statuses current (CLEARED vs PENDING) and "
            "review this report each month."
        )

    monthly_trend = analytics.get("monthly_trend") or []
    ebitda_trend = [
        {
            "month": m.get("month"),
            "month_key": m.get("month_key"),
            "ebitda": round(float(m.get("revenue", 0)) - float(m.get("expenses", 0)), 2),
        }
        for m in monthly_trend
    ]

    expense_top = (analytics.get("expense_allocation") or [])[:10]

    largest_exp_cat = expense_top[0]["category"] if expense_top else None
    largest_exp_pct = expense_top[0]["percentage"] if expense_top else None
    concentration_risk = (
        f"Largest expense category: {largest_exp_cat} (~{largest_exp_pct:.1f}% of spend)."
        if largest_exp_cat and largest_exp_pct and largest_exp_pct > 25
        else None
    )

    has_data = gr > 0 or te > 0

    return {
        "range": analytics["range"],
        "has_data": has_data,
        "kpis": {
            "gross_revenue": gr,
            "total_revenue_generated": gr,
            "total_expenses": te,
            "net_profit": net_profit,
            "net_loss": abs(net_profit) if net_profit < 0 else 0.0,
            "net_cash_flow": ncf,
            "accounts_receivable": ar,
            "accounts_payable": ap,
            "monthly_average_revenue": round(monthly_avg_revenue, 2),
            "monthly_average_expense": round(monthly_avg_expense, 2),
            "profit_margin_pct": round(margin_pct, 2),
            "burn_rate_monthly": round(burn_rate_monthly, 2) if burn_rate_monthly else None,
            "revenue_growth_pct": rev_growth,
            "expense_growth_pct": exp_growth_pct,
            "operating_efficiency_score": operating_efficiency_score,
            "financial_health_score": financial_health_score,
        },
        "ebitda": {
            "value": round(ebitda, 2),
            "margin_pct": round(ebitda_margin_pct, 2),
            "method_note": (
                "SME EBITDA proxy = sum(Recorded Revenue) − sum(Recorded Expenses) in period; "
                "no separate interest/tax/depreciation lines in ledger."
            ),
        },
        "profit_loss": {
            "status": pl_status,
            "headline": pl_headline,
            "improving": improving,
            "declining": declining,
            "ebitda": round(ebitda, 2),
        },
        "financial_condition": {
            "label": fin_label,
            "score": financial_health_score,
            "explanation": fin_expl,
        },
        "loan_readiness": {
            "label": lr_label,
            "score": lr_score,
            "disclaimer": (
                "Internal readiness indicator only—not a credit score or lending decision."
            ),
            "factors": lr_factors,
        },
        "executive_summary": {"paragraphs": paragraphs},
        "recommendations": recs[:12],
        "business_metrics": {
            "working_capital_proxy": round(wc_proxy, 2),
            "receivable_collection_note": (
                f"{cash.get('accounts_receivable', {}).get('count', 0)} pending revenue line(s)."
            ),
            "payable_pressure_note": (
                f"{cash.get('accounts_payable', {}).get('count', 0)} pending expense line(s)."
            ),
            "expense_concentration": concentration_risk,
            "months_in_range": n_months,
        },
        "charts": {
            "monthly_trend": monthly_trend,
            "ebitda_trend": ebitda_trend,
            "expense_allocation": expense_top,
            "cash_flow_totals": cash.get("totals"),
            "monthly_cash_flow": cash.get("monthly_liquidity") or [],
            "receivable_payable": {"receivable": ar, "payable": ap},
        },
    }
