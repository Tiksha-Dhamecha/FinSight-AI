/**
 * Dashboard Page — binds live data from:
 *   GET /api/transactions/analytics/   (KPIs, monthly trend, expense allocation, anomalies)
 *   GET /api/transactions/reports/     (health score, financial condition, net profit, EBITDA)
 *
 * Depends: config.js, auth.js, inr-format.js  (loaded before this file in HTML)
 * Does NOT disturb any other module (analytics, cash-flow, operations, reports, transactions).
 */
(function () {
  "use strict";

  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
  /** Preset passed through to existing analytics + reports endpoints (unchanged backend logic). */
  var currentFilter = "last_6_months";

  /* ─── helpers ─────────────────────────────────────────────────────────── */
  function apiHeaders() {
    return Object.assign(
      { Accept: "application/json" },
      window.FinSightAuth && window.FinSightAuth.authHeader
        ? window.FinSightAuth.authHeader()
        : {}
    );
  }

  function fmt(n) {
    if (n === null || n === undefined) return "—";
    return window.formatINR ? window.formatINR(n) : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function setHtml(id, val) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = val;
  }

  function buildAnalyticsUrl() {
    var u = API_BASE + "/api/transactions/analytics/?range=" + encodeURIComponent(currentFilter);
    if (currentFilter === "custom") {
      var d1 = document.getElementById("dash-custom-start");
      var d2 = document.getElementById("dash-custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        u += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }
    return u;
  }

  function buildReportsUrl() {
    var u = API_BASE + "/api/transactions/reports/?range=" + encodeURIComponent(currentFilter);
    if (currentFilter === "custom") {
      var d1 = document.getElementById("dash-custom-start");
      var d2 = document.getElementById("dash-custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        u += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }
    return u;
  }

  function canFetchForCurrentFilter() {
    if (currentFilter !== "custom") return true;
    var d1 = document.getElementById("dash-custom-start");
    var d2 = document.getElementById("dash-custom-end");
    return !!(d1 && d2 && d1.value && d2.value);
  }

  function setFilterButtons(active) {
    ["last_6_months", "ytd", "custom"].forEach(function (id) {
      var el = document.getElementById("dash-filter-" + (id === "custom" ? "custom_toggle" : id));
      if (!el) return;
      if (id === active) {
        el.className =
          "px-4 py-2 rounded-lg text-xs font-bold bg-primary text-on-primary shadow-sm transition-colors";
      } else if (id === "custom") {
        el.className =
          "px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-primary bg-slate-100/80 transition-colors";
      } else {
        el.className =
          "px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-primary bg-slate-100/80 transition-colors";
      }
    });
  }

  function updateRangeLabelFromPayload(reportsData, analyticsData) {
    var r = (reportsData && reportsData.range) || (analyticsData && analyticsData.range);
    var el = document.getElementById("dash-filter-range-label");
    if (!el) return;
    if (r && r.start && r.end) {
      el.textContent = "Showing portfolio for " + r.start + " → " + r.end;
    } else {
      el.textContent = "";
    }
  }

  function displayNameFromUser(u) {
    if (!u || typeof u !== "object") return "User";
    var first = (u.first_name || "").trim();
    var last = (u.last_name || "").trim();
    var full = (first + " " + last).trim();
    if (full) return full;
    if (u.username) return String(u.username).trim();
    if (u.email) return String(u.email).trim();
    return "User";
  }

  function firstLetterIdentity(u) {
    if (!u || typeof u !== "object") return "?";
    var first = (u.first_name || "").trim();
    var last = (u.last_name || "").trim();
    var full = (first + " " + last).trim();
    var src = full || (u.username && String(u.username).trim()) || (u.email && String(u.email).trim()) || "?";
    var m = src.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
    if (m) return m[0].toUpperCase();
    var d = src.match(/\d/);
    if (d) return d[0];
    return src.charAt(0) ? src.charAt(0).toUpperCase() : "?";
  }

  async function hydrateUserProfile() {
    if (!window.FinSightAuth || !FinSightAuth.getToken || !FinSightAuth.getToken()) return;
    try {
      var me = await FinSightAuth.fetchMe();
      var u = (me && me.user) || {};
      var name = displayNameFromUser(u);
      setText("dash-username", name);
      var nu = document.getElementById("dash-username");
      if (nu) nu.setAttribute("title", name);
      var sub = document.getElementById("dash-user-subtitle");
      if (sub) {
        sub.textContent = u.email ? String(u.email) : "Business owner";
        if (u.email) sub.setAttribute("title", u.email);
      }
      var ini = document.getElementById("dash-user-initial");
      if (ini) ini.textContent = firstLetterIdentity(u);
      var img = document.getElementById("dash-user-avatar-img");
      if (img && u.avatar_url) {
        img.src = u.avatar_url;
        img.classList.remove("hidden");
        if (ini) ini.classList.add("hidden");
      } else if (img) {
        img.removeAttribute("src");
        img.classList.add("hidden");
        if (ini) ini.classList.remove("hidden");
      }
    } catch (e) {
      console.warn("Dashboard: profile hydrate skipped", e);
    }
  }

  /* ─── safe delta badge ─────────────────────────────────────────────────── */
  function deltaBadge(pct, positiveIsGood) {
    if (pct === null || pct === undefined) return "";
    var pos  = pct >= 0;
    var good = positiveIsGood ? pos : !pos;
    var color = good ? "text-secondary bg-secondary-container/20" : "text-error bg-error-container/20";
    var icon  = pos ? "trending_up" : "trending_down";
    return (
      '<span class="text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded ' + color + '">' +
      '<span class="material-symbols-outlined text-[14px]">' + icon + "</span>" +
      (pos ? "+" : "") + Number(pct).toFixed(1) + "%" +
      "</span>"
    );
  }

  /* ─── progress bar fill ────────────────────────────────────────────────── */
  function setBarWidth(id, pct) {
    var el = document.getElementById(id);
    if (!el) return;
    var w = Math.min(100, Math.max(0, Number(pct) || 0));
    el.style.width = w + "%";
  }

  /* ─── Operating Margin mini barchart ──────────────────────────────────── */
  function renderOperatingMarginChart(grossRevenue, netProfit, totalExpense) {
    var maxVal = Math.max(Math.abs(grossRevenue), Math.abs(netProfit), Math.abs(totalExpense), 1);

    var revPct  = Math.round((grossRevenue / maxVal) * 100);
    var profPct = Math.round((Math.max(0, netProfit) / maxVal) * 100);
    var expPct  = Math.round((totalExpense / maxVal) * 100);

    var revBar  = document.getElementById("dash-bar-revenue");
    var profBar = document.getElementById("dash-bar-profit");
    var expBar  = document.getElementById("dash-bar-expense");

    if (revBar)  revBar.style.height  = Math.max(4, revPct)  + "%";
    if (profBar) profBar.style.height = Math.max(4, profPct) + "%";
    if (expBar)  expBar.style.height  = Math.max(4, expPct)  + "%";
  }

  /* ─── Health Score SVG ring ────────────────────────────────────────────── */
  function renderHealthScoreRing(score) {
    /* stroke-dasharray total = 2π × r = 2π × 45 ≈ 282.74
       stroke-dashoffset = total × (1 - score/100)               */
    var total  = 2 * Math.PI * 45;          // ≈ 282.74
    var offset = total * (1 - score / 100);
    var ring   = document.getElementById("dash-health-ring");
    if (ring) {
      ring.setAttribute("stroke-dasharray", total.toFixed(2));
      ring.setAttribute("stroke-dashoffset", offset.toFixed(2));
    }
    setText("dash-health-score", score);
  }

  /* ─── Recommendations section ─────────────────────────────────────────── */
  function renderRecommendations(recommendations) {
    var container = document.getElementById("dash-recommendations-list");
    if (!container) return;
    if (!recommendations || recommendations.length === 0) {
      container.innerHTML =
        '<p class="text-sm text-on-surface-variant italic">No recommendations for this period. Keep up the good work!</p>';
      return;
    }
    var icons   = ["savings", "speed", "contract", "analytics", "trending_up", "payments"];
    var colors  = ["text-secondary", "text-blue-500", "text-tertiary-fixed-dim", "text-primary", "text-secondary", "text-blue-500"];
    var bgClrs  = ["bg-white", "bg-white", "bg-white", "bg-white", "bg-white", "bg-white"];

    var html = "";
    recommendations.slice(0, 3).forEach(function (rec, idx) {
      var icon  = icons[idx % icons.length];
      var clr   = colors[idx % colors.length];
      html +=
        '<div class="bg-surface-container-low p-5 rounded-xl flex items-center gap-6 group hover:bg-white hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 border border-transparent hover:border-outline-variant/20">' +
        '<div class="w-12 h-12 ' + bgClrs[idx] + ' rounded-lg flex items-center justify-center ' + clr + ' shadow-sm shrink-0">' +
        '<span class="material-symbols-outlined">' + icon + "</span></div>" +
        '<div class="flex-grow"><p class="text-sm text-on-surface-variant leading-relaxed">' +
        escHtml(rec) + "</p></div>" +
        '<span class="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors shrink-0">chevron_right</span>' +
        "</div>";
    });
    container.innerHTML = html;
  }

  function escHtml(s) {
    var d = document.createElement("div");
    d.textContent = s || "";
    return d.innerHTML;
  }

  /**
   * Operating margin % = (operating result ÷ revenue) × 100 — uses existing KPIs:
   * reports.kpis.profit_margin_pct (same as analytics avg margin) or derived from revenue/expense.
   */
  function computeOperatingMarginPct(analyticsData, reportsData) {
    if (reportsData && reportsData.kpis) {
      var pm = reportsData.kpis.profit_margin_pct;
      if (pm !== null && pm !== undefined && !isNaN(Number(pm))) return Number(pm);
      var gr = Number(reportsData.kpis.gross_revenue || 0);
      var np = Number(reportsData.kpis.net_profit || 0);
      if (gr > 0) return (np / gr) * 100;
    }
    if (analyticsData) {
      var ap = analyticsData.avg_profit_margin_pct;
      if (ap !== null && ap !== undefined && !isNaN(Number(ap))) return Number(ap);
      var grA = Number(analyticsData.gross_revenue || 0);
      var teA = Number(analyticsData.total_expense || 0);
      if (grA > 0) return ((grA - teA) / grA) * 100;
    }
    return null;
  }

  function revProfitExpenseForMarginChart(analyticsData, reportsData) {
    var gr = 0;
    var te = 0;
    var np = 0;
    if (analyticsData) {
      gr = Number(analyticsData.gross_revenue || 0);
      te = Number(analyticsData.total_expense || 0);
    }
    if (reportsData && reportsData.kpis) {
      if (!gr) gr = Number(reportsData.kpis.gross_revenue || 0);
      if (!te) te = Number(reportsData.kpis.total_expenses || 0);
      np = Number(reportsData.kpis.net_profit || 0);
    }
    if (!np && (gr || te)) np = gr - te;
    return { gr: gr, te: te, np: np };
  }

  function applyOperatingMarginUi(analyticsData, reportsData) {
    var om = computeOperatingMarginPct(analyticsData, reportsData);
    var pctStr = om !== null && !isNaN(om) ? om.toFixed(1) + "%" : "—";
    setText("dash-margin-efficiency", pctStr);
    setText("dash-operating-margin-hero", pctStr);
    setText("dash-kpi-operating-margin", pctStr);
    if (om !== null && !isNaN(om)) {
      var w = Math.min(100, Math.max(0, om));
      if (om < 0) w = Math.min(100, Math.abs(om));
      setBarWidth("dash-bar-kpi-margin", w);
    } else {
      setBarWidth("dash-bar-kpi-margin", 0);
    }
    var seg = revProfitExpenseForMarginChart(analyticsData, reportsData);
    renderOperatingMarginChart(seg.gr, seg.np, seg.te);
  }

  /* ─── Health sub-labels (Liquidity / Efficiency / Risk) ─────────────────*/
  function renderHealthSubLabels(reportsData, analyticsData) {
    var liqStatus =
      reportsData.kpis && analyticsData && analyticsData.net_cash_flow >= 0 ? "Strong" : "Watchlist";
    var effScore   = reportsData.kpis ? reportsData.kpis.operating_efficiency_score : null;
    var effLabel   = effScore !== null ? (effScore >= 75 ? "Optimal" : effScore >= 55 ? "Moderate" : "Low") : "—";
    var riskLabel  = "Low";
    if (reportsData.financial_condition) {
      var lbl = reportsData.financial_condition.label || "";
      if (lbl.includes("Risk") || lbl.includes("At Risk"))     riskLabel = "High";
      else if (lbl.includes("Attention") || lbl.includes("Moderate")) riskLabel = "Medium";
    }

    setText("dash-health-liquidity",  liqStatus);
    setText("dash-health-efficiency", effLabel);
    setText("dash-health-risk",       riskLabel);
  }

  /* ─── Financial Maturity Section ─────────────────────────────────────── */
  function renderFinancialMaturity(reportsData) {
    var score    = reportsData.kpis ? reportsData.kpis.financial_health_score : null;
    var condLbl  = reportsData.financial_condition ? reportsData.financial_condition.label : "—";
    var condExpl = reportsData.financial_condition ? reportsData.financial_condition.explanation : "";
    var lrScore  = reportsData.loan_readiness ? reportsData.loan_readiness.score : null;
    var lrLabel  = reportsData.loan_readiness ? reportsData.loan_readiness.label : "—";
    var effScore = reportsData.kpis ? reportsData.kpis.operating_efficiency_score : null;

    // Summary text
    if (score !== null) {
      var rank = score >= 78 ? "Top 15%" : score >= 62 ? "Top 35%" : score >= 45 ? "Top 55%" : "Lower 50%";
      var el = document.getElementById("dash-maturity-rank");
      if (el) {
        el.innerHTML = 'Your business is currently in the <span class="text-primary font-bold">' + rank + '</span> of peer performers in your sector.';
      }
    }

    // Benchmark = financial health score bar (0-100)
    var benchEl = document.getElementById("dash-benchmark-bar");
    if (benchEl && score !== null) {
      benchEl.style.width = Math.min(100, score) + "%";
    }
    setText("dash-benchmark-label", condLbl);

    // Capital Efficiency = operating efficiency score bar
    var capEl = document.getElementById("dash-capital-bar");
    if (capEl && effScore !== null) {
      capEl.style.width = Math.min(100, effScore) + "%";
    }
    setText("dash-capital-label", effScore !== null ? (effScore >= 75 ? "Healthy" : effScore >= 55 ? "Moderate" : "Needs Work") : "—");

    // AI advisor quote
    var quoteEl = document.getElementById("dash-ai-quote");
    if (quoteEl && condExpl) {
      quoteEl.textContent = '"' + condExpl + '"';
    }
  }

  /* ─── Main fetch: analytics ──────────────────────────────────────────── */
  async function fetchAnalytics() {
    try {
      var res = await fetch(buildAnalyticsUrl(), { headers: apiHeaders(), credentials: "omit" });
      if (res.status === 401) { console.warn("Dashboard analytics: unauthorized"); return null; }
      if (!res.ok) throw new Error("Analytics API " + res.status);
      return res.json();
    } catch (e) {
      console.error("Dashboard: analytics fetch failed", e);
      return null;
    }
  }

  /* ─── Main fetch: reports ────────────────────────────────────────────── */
  async function fetchReports() {
    try {
      var res = await fetch(buildReportsUrl(), { headers: apiHeaders(), credentials: "omit" });
      if (res.status === 401) { console.warn("Dashboard reports: unauthorized"); return null; }
      if (!res.ok) throw new Error("Reports API " + res.status);
      return res.json();
    } catch (e) {
      console.error("Dashboard: reports fetch failed", e);
      return null;
    }
  }

  /* ─── Bind everything ────────────────────────────────────────────────── */
  async function loadDashboard() {
    if (!canFetchForCurrentFilter()) {
      var hint = document.getElementById("dash-filter-range-label");
      if (hint) {
        hint.textContent = "Select a start and end date, then click Apply.";
      }
      return;
    }

    showLoadingState();

    var analyticsData = await fetchAnalytics();
    var reportsData   = await fetchReports();

    if (!analyticsData && !reportsData) {
      showErrorState();
      return;
    }

    hideLoadingState();

    updateRangeLabelFromPayload(reportsData, analyticsData);

    /* ---------- KPI Cards ---------- */
    if (analyticsData) {
      var grossRevenue  = analyticsData.gross_revenue  || 0;
      var totalExpense  = analyticsData.total_expense  || 0;
      var netCashFlow   = analyticsData.net_cash_flow  || 0;
      var revChangePct  = analyticsData.revenue_change_vs_prior_pct;

      setText("dash-kpi-revenue",    fmt(grossRevenue));
      setText("dash-kpi-expense",    fmt(totalExpense));
      setText("dash-kpi-cashflow",   fmt(netCashFlow));

      // Revenue badge
      setHtml("dash-kpi-revenue-badge", deltaBadge(revChangePct, true));

      // Expense badge — expense rising is bad
      setHtml("dash-kpi-expense-badge", '<span class="text-[10px] font-bold text-on-surface-variant flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">vs prior period</span>');

      // Cash flow badge
      var cfBadge = netCashFlow >= 0
        ? '<span class="text-[10px] font-bold text-secondary flex items-center gap-1 bg-secondary-container/20 px-2 py-1 rounded"><span class="material-symbols-outlined text-[14px]">trending_up</span>Inflow-led</span>'
        : '<span class="text-[10px] font-bold text-error flex items-center gap-1 bg-error-container/20 px-2 py-1 rounded"><span class="material-symbols-outlined text-[14px]">trending_down</span>Net outflow</span>';
      setHtml("dash-kpi-cashflow-badge", cfBadge);

      // KPI progress bars (visual fill relative to revenue)
      var maxKpi = Math.max(grossRevenue, totalExpense, Math.abs(netCashFlow), 1);
      setBarWidth("dash-bar-kpi-revenue",  (grossRevenue        / maxKpi) * 100);
      setBarWidth("dash-bar-kpi-expense",  (totalExpense        / maxKpi) * 100);
      setBarWidth("dash-bar-kpi-cashflow", (Math.abs(netCashFlow) / maxKpi) * 100);
    }

    /* ---------- Net Profit KPI (from reports) ---------- */
    if (reportsData && reportsData.kpis) {
      var netProfit = reportsData.kpis.net_profit || 0;
      setText("dash-kpi-netprofit", fmt(netProfit));

      var npPct = reportsData.kpis.profit_margin_pct;
      var npBadge = npPct !== null
        ? deltaBadge(npPct, true)
        : '<span class="text-[10px] font-bold text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-1 rounded">—</span>';
      setHtml("dash-kpi-netprofit-badge", npBadge);

      var maxKpiR = Math.max(Math.abs(netProfit), analyticsData ? analyticsData.gross_revenue : 1, 1);
      setBarWidth("dash-bar-kpi-netprofit", (Math.abs(netProfit) / maxKpiR) * 100);
    }

    /* ---------- Health Score ---------- */
    if (reportsData && reportsData.kpis) {
      var hs = Math.round(reportsData.kpis.financial_health_score || 0);
      renderHealthScoreRing(hs);

      var hsLbl  = reportsData.financial_condition ? reportsData.financial_condition.label : "—";
      var revGrowth = reportsData.kpis.revenue_growth_pct;
      var growthTxt = revGrowth !== null && revGrowth !== undefined
        ? (revGrowth >= 0 ? "+" : "") + revGrowth.toFixed(1) + "pts vs prior"
        : "Score from your data";
      setText("dash-health-badge-label",  hsLbl);
      setText("dash-health-growth-label", growthTxt);

      renderHealthSubLabels(reportsData, analyticsData || {});
    }

    /* ---------- Operating Margin (mini-chart + KPI + hero): uses existing KPIs ---------- */
    if (analyticsData || reportsData) {
      applyOperatingMarginUi(analyticsData, reportsData);
    }

    /* ---------- Recommendations ---------- */
    if (reportsData && reportsData.recommendations) {
      renderRecommendations(reportsData.recommendations);
    } else if (analyticsData && analyticsData.anomalies && analyticsData.anomalies.length > 0) {
      // Fallback: use anomaly insights as recommendations
      var fallbackRecs = (analyticsData.anomalies || []).map(function(a) { return a.insight || a.explanation || a.title; });
      renderRecommendations(fallbackRecs);
    }

    /* ---------- Financial Maturity ---------- */
    if (reportsData) {
      renderFinancialMaturity(reportsData);
    }

    /* ---------- Greeting subtitle (data-aware) ---------- */
    if (analyticsData || reportsData) {
      var hasData = (analyticsData && (analyticsData.gross_revenue > 0 || analyticsData.total_expense > 0));
      var summaryEl = document.getElementById("dash-header-summary");
      if (summaryEl) {
        if (hasData && reportsData && reportsData.executive_summary && reportsData.executive_summary.paragraphs) {
          summaryEl.textContent = reportsData.executive_summary.paragraphs[0] || "";
        } else if (!hasData) {
          summaryEl.textContent = "No transactions yet. Import or enter data to see your live business health metrics.";
        }
      }
    }

    /* ---------- Anomaly alert badge ---------- */
    if (analyticsData && analyticsData.anomalies && analyticsData.anomalies.length > 0) {
      var topAnom  = analyticsData.anomalies[0];
      var alertEl  = document.getElementById("dash-alert-label");
      var alertSub = document.getElementById("dash-alert-sub");
      if (alertEl)  alertEl.textContent  = topAnom.title || "Anomaly Detected";
      if (alertSub) alertSub.textContent = topAnom.explanation || "";
    }
  }

  /* ─── UI state helpers ───────────────────────────────────────────────── */
  function showLoadingState() {
    var spinner = document.getElementById("dash-loading-overlay");
    if (spinner) spinner.classList.remove("hidden");
  }

  function hideLoadingState() {
    var spinner = document.getElementById("dash-loading-overlay");
    if (spinner) spinner.classList.add("hidden");
  }

  function showErrorState() {
    hideLoadingState();
    var el = document.getElementById("dash-header-summary");
    if (el) el.textContent = "Unable to load data. Please check your connection and refresh.";
  }

  function hideCustomRange() {
    var cr = document.getElementById("dash-custom-range");
    if (cr) cr.classList.add("hidden");
  }

  function showCustomRange() {
    var cr = document.getElementById("dash-custom-range");
    if (cr) cr.classList.remove("hidden");
  }

  /* ─── Boot ───────────────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", function () {
    hydrateUserProfile();

    var b1 = document.getElementById("dash-filter-last_6_months");
    var b2 = document.getElementById("dash-filter-ytd");
    var b3 = document.getElementById("dash-filter-custom_toggle");
    var b4 = document.getElementById("dash-filter-custom_apply");
    if (b1) {
      b1.addEventListener("click", function () {
        currentFilter = "last_6_months";
        hideCustomRange();
        setFilterButtons("last_6_months");
        loadDashboard();
      });
    }
    if (b2) {
      b2.addEventListener("click", function () {
        currentFilter = "ytd";
        hideCustomRange();
        setFilterButtons("ytd");
        loadDashboard();
      });
    }
    if (b3) {
      b3.addEventListener("click", function () {
        currentFilter = "custom";
        setFilterButtons("custom");
        showCustomRange();
        var hint = document.getElementById("dash-filter-range-label");
        if (hint) {
          hint.textContent = "Choose dates, then click Apply to refresh the portfolio.";
        }
      });
    }
    if (b4) {
      b4.addEventListener("click", function () {
        currentFilter = "custom";
        setFilterButtons("custom");
        loadDashboard();
      });
    }

    setFilterButtons("last_6_months");
    loadDashboard();
  });

  // Expose for external refresh (e.g. after import on another tab returns)
  window.FinSightDashboard = { reload: loadDashboard };
})();
