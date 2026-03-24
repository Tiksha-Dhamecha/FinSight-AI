/**
 * Analytics & Trends — loads /api/transactions/analytics/ (real transactions, filtered).
 * Depends: config.js, auth.js, inr-format.js
 */
(function () {
  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8001").replace(/\/$/, "");
  var ANALYTICS_URL = API_BASE + "/api/transactions/analytics/";
  var currentFilter = "last_6_months";

  function apiHeaders() {
    return Object.assign(
      { Accept: "application/json" },
      window.FinSightAuth && window.FinSightAuth.authHeader ? window.FinSightAuth.authHeader() : {}
    );
  }

  function fmt(n) {
    return window.formatINR ? window.formatINR(n) : "₹" + Number(n).toFixed(2);
  }

  window.toggleCustomRange = function () {
    var inputs = document.getElementById("custom-range-inputs");
    if (!inputs) return;
    inputs.classList.toggle("hidden");
    inputs.classList.toggle("flex");
  };

  window.setFilter = function (range) {
    currentFilter = range;
    ["last_6_months", "ytd", "custom"].forEach(function (id) {
      var el = document.getElementById("filter-" + id);
      if (!el) return;
      if (id === range) {
        el.className =
          "px-6 py-2 bg-surface-container-lowest text-primary font-semibold rounded-lg shadow-sm text-sm transition-colors";
      } else {
        el.className =
          "px-6 py-2 text-slate-500 hover:text-primary font-semibold text-sm transition-colors";
      }
    });
    fetchAnalytics();
  };

  async function fetchAnalytics() {
    var url = ANALYTICS_URL + "?range=" + encodeURIComponent(currentFilter);
    if (currentFilter === "custom") {
      var d1 = document.getElementById("custom-start");
      var d2 = document.getElementById("custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        url += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }

    try {
      var res = await fetch(url, { headers: apiHeaders(), credentials: "omit" });
      if (res.status === 401) {
        console.warn("Analytics: unauthorized");
        return;
      }
      if (!res.ok) throw new Error("Analytics fetch failed");
      var data = await res.json();

      var gr = document.getElementById("val-gross-revenue");
      if (gr) gr.textContent = fmt(data.gross_revenue || 0);

      var te = document.getElementById("val-total-expense");
      if (te) {
        var exp = data.total_expense || 0;
        te.textContent = exp >= 100000 ? fmt(exp) : fmt(exp);
      }

      var sub = document.getElementById("analytics-revenue-subline");
      if (sub) {
        if (data.revenue_change_vs_prior_pct != null) {
          var p = data.revenue_change_vs_prior_pct;
          var pos = p >= 0;
          sub.innerHTML =
            "vs prior period of equal length " +
            '<span class="text-secondary font-bold flex items-center ml-2">' +
            '<span class="material-symbols-outlined text-xs">' +
            (pos ? "trending_up" : "trending_down") +
            "</span>" +
            (pos ? "+" : "") +
            p.toFixed(1) +
            "%</span>";
        } else {
          sub.textContent = "Based on your recorded revenue transactions in this range.";
        }
      }

      renderRevenueChart(data.monthly_trend || []);
      renderProfitBars(data.monthly_trend || [], data.gross_revenue || 0, data.total_expense || 0, data.avg_profit_margin_pct);
      renderExpenseDonut(data.expense_allocation || []);
      renderInsightsGrid(data);
    } catch (e) {
      console.error("Failed to load analytics", e);
    }
  }

  function renderInsightsGrid(data) {
    var grid = document.getElementById("analytics-insights-grid");
    if (!grid) return;

    var primary = (data.anomalies && data.anomalies[0]) || null;
    var ncf = data.net_cash_flow != null ? data.net_cash_flow : 0;
    var cac = data.customer_acquisition_cost;
    var cacNote = data.customer_acquisition_note || "";
    var margin = data.avg_profit_margin_pct != null ? data.avg_profit_margin_pct : 0;

    var anomalyHtml = primary
      ? '<div class="bg-surface-container-lowest p-6 rounded-xl border-l-4 ' +
        (primary.severity === "high"
          ? "border-error"
          : primary.severity === "medium"
            ? "border-tertiary-fixed-dim"
            : "border-outline-variant") +
        '">' +
        '<div class="flex items-center gap-3 mb-4">' +
        '<div class="bg-error-container text-on-error-container p-2 rounded-lg">' +
        '<span class="material-symbols-outlined" data-icon="priority_high">priority_high</span></div>' +
        '<h4 class="font-headline font-bold text-primary">Expense insight</h4></div>' +
        '<p class="text-on-surface-variant text-sm mb-2 font-bold">' +
        escapeHtml(primary.title) +
        "</p>" +
        '<p class="text-on-surface-variant text-sm mb-4 leading-relaxed">' +
        escapeHtml(primary.explanation) +
        "</p>" +
        '<p class="text-xs text-outline">' +
        (primary.amount ? fmt(primary.amount) + " · " : "") +
        escapeHtml(primary.category || "") +
        " · " +
        escapeHtml(primary.period_label || "") +
        "</p></div>"
      : '<div class="bg-surface-container-lowest p-6 rounded-xl border-l-4 border-outline-variant"><p class="text-sm text-on-surface-variant">No transactions in range.</p></div>';

    var efficiencyHtml =
      '<div class="bg-surface-container-lowest p-6 rounded-xl border-l-4 border-secondary">' +
      '<div class="flex items-center gap-3 mb-4">' +
      '<div class="bg-secondary-container text-on-secondary-container p-2 rounded-lg">' +
      '<span class="material-symbols-outlined" data-icon="auto_awesome">auto_awesome</span></div>' +
      '<h4 class="font-headline font-bold text-primary">Gross margin (range)</h4></div>' +
      '<p class="text-on-surface-variant text-sm mb-4 leading-relaxed">' +
      "Average gross profit margin for the selected period is <span class=\"text-secondary font-bold\">" +
      margin.toFixed(1) +
      "%</span> (revenue − expenses, as recorded).</p>" +
      '<p class="text-xs text-outline">Uses Revenue and Expense types from your ledger.</p></div>';

    var ncfHtml =
      '<div class="bg-primary p-6 rounded-xl text-on-primary">' +
      '<p class="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60 mb-2">Net cash flow</p>' +
      '<div class="flex items-end justify-between">' +
      '<span class="text-3xl font-headline font-extrabold" id="val-net-cash-flow">' +
      fmt(ncf) +
      "</span>" +
      '<span class="text-secondary-fixed text-sm font-bold">' +
      (ncf >= 0 ? "Inflow-led" : "Net outflow") +
      "</span></div>" +
      '<p class="text-xs opacity-70 mt-2">Positive entries minus absolute negative entries (all types).</p></div>';

    var cacHtml =
      '<div class="bg-surface-container-lowest p-6 rounded-xl shadow-sm">' +
      '<p class="text-[10px] text-outline font-bold uppercase tracking-[0.2em] mb-2">Customer acquisition cost (est.)</p>' +
      '<div class="flex items-end justify-between">' +
      '<span class="text-3xl font-headline font-extrabold text-primary" id="val-cac">' +
      (cac != null ? fmt(cac) : "—") +
      "</span>" +
      '<span class="text-on-surface-variant text-xs max-w-[40%] text-right">' +
      escapeHtml(cacNote) +
      "</span></div></div>";

    grid.innerHTML = anomalyHtml + efficiencyHtml + ncfHtml + cacHtml;
  }

  function escapeHtml(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function attrEsc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderRevenueChart(trendData) {
    var c = document.getElementById("revenue-chart-container");
    if (!c) return;
    if (!trendData || trendData.length === 0) {
      c.innerHTML =
        '<p class="text-sm text-outline absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">No revenue data for this range</p>';
      return;
    }

    var maxRev = Math.max.apply(
      null,
      trendData.map(function (d) {
        return d.revenue;
      })
    );
    if (maxRev === 0) maxRev = 1;

    var width = 800;
    var height = 200;
    var paddingBottom = 40;
    var usableHeight = height - paddingBottom - 20;

    var pathD = "";
    var dx = width / Math.max(1, trendData.length - 1);
    var points = trendData.map(function (d, i) {
      var x = i * dx;
      var y = height - paddingBottom - (d.revenue / maxRev) * usableHeight;
      if (i === 0) pathD += "M" + x + "," + y + " ";
      else {
        var prevX = (i - 1) * dx;
        var prevY = height - paddingBottom - (trendData[i - 1].revenue / maxRev) * usableHeight;
        var cp1X = prevX + dx * 0.5;
        var cp1Y = prevY;
        var cp2X = x - dx * 0.5;
        var cp2Y = y;
        pathD += "C" + cp1X + "," + cp1Y + " " + cp2X + "," + cp2Y + " " + x + "," + y + " ";
      }
      return { x: x, y: y, label: d.month, rev: d.revenue };
    });

    var circlesHTML = "";
    var labelsHTML =
      '<div class="absolute bottom-[-10px] inset-x-0 flex justify-between text-[10px] font-bold text-outline uppercase tracking-wider">';
    points.forEach(function (p, i) {
      circlesHTML +=
        '<circle cx="' +
        p.x +
        '" cy="' +
        p.y +
        '" fill="#006d3d" r="' +
        (i === points.length - 1 ? 6 : 4) +
        '" stroke="white" stroke-width="' +
        (i === points.length - 1 ? 2 : 0) +
        '"><title>' +
        fmt(p.rev) +
        "</title></circle>";
      labelsHTML += "<span>" + p.label + "</span>";
    });
    labelsHTML += "</div>";

    c.innerHTML =
      '<div class="absolute inset-x-0 bottom-[24px] h-[calc(100%-24px)] flex flex-col justify-between opacity-10">' +
      '<div class="border-b border-outline-variant w-full"></div>' +
      '<div class="border-b border-outline-variant w-full"></div>' +
      '<div class="border-b border-outline-variant w-full"></div></div>' +
      '<svg class="absolute inset-0 w-full h-[calc(100%-24px)] overflow-visible drop-shadow-xl" viewbox="0 0 ' +
      width +
      " " +
      (height - paddingBottom) +
      '" preserveAspectRatio="none">' +
      '<path d="' +
      pathD +
      '" fill="none" stroke="#006d3d" stroke-width="3"></path>' +
      '<path d="' +
      pathD +
      " V" +
      (height - paddingBottom) +
      ' H0 Z" fill="url(#chart-grad)" opacity="0.1"></path>' +
      "<defs>" +
      '<linearGradient id="chart-grad" x1="0%" x2="0%" y1="0%" y2="100%">' +
      '<stop offset="0%" style="stop-color:#006d3d;stop-opacity:1"></stop>' +
      '<stop offset="100%" style="stop-color:#006d3d;stop-opacity:0"></stop>' +
      "</linearGradient></defs>" +
      circlesHTML +
      "</svg>" +
      labelsHTML;
  }

  function renderProfitBars(trendData, totRev, totExp, avgMarginFromApi) {
    var c = document.getElementById("val-profit-bars");
    var avgMarginEl = document.getElementById("val-avg-profit-margin");
    var avgMarginBar = document.getElementById("val-avg-profit-bar");
    if (!c || !avgMarginEl || !avgMarginBar) return;

    if (!trendData || trendData.length === 0) {
      c.innerHTML = "";
      avgMarginEl.textContent = "0%";
      avgMarginBar.style.width = "0%";
      return;
    }

    var overallProfit = totRev - totExp;
    var avgMargin =
      avgMarginFromApi != null
        ? Number(avgMarginFromApi).toFixed(1)
        : totRev > 0
          ? ((overallProfit / totRev) * 100).toFixed(1)
          : "0.0";

    avgMarginEl.textContent = avgMargin + "%";
    avgMarginEl.className =
      "text-sm font-bold " + (parseFloat(avgMargin) < 0 ? "text-error" : "text-primary");
    var barColor = parseFloat(avgMargin) < 0 ? "bg-error" : "bg-secondary";
    avgMarginBar.className = "h-full transition-all duration-700 " + barColor;
    avgMarginBar.style.width = Math.min(100, Math.max(0, parseFloat(avgMargin))) + "%";

    var maxVal = Math.max.apply(
      null,
      trendData.map(function (d) {
        return Math.abs(d.profit);
      })
    );
    if (maxVal === 0) maxVal = 1;

    var html = "";
    trendData.forEach(function (d) {
      var h = (Math.abs(d.profit) / maxVal) * 100;
      var isNegative = d.profit < 0;
      var bgClass = isNegative ? "bg-error/70 group-hover:bg-error" : "bg-primary group-hover:bg-primary-container";
      var labelClass = isNegative ? "text-error" : "text-outline";
      var tip = fmt(d.profit) + " profit · " + fmt(d.revenue) + " rev · " + fmt(d.expenses) + " exp";
      html +=
        '<div class="flex flex-col justify-end items-center gap-2 group w-full h-full relative" title="' +
        attrEsc(tip) +
        '">' +
        '<div class="' +
        bgClass +
        ' w-full rounded-[2px] transition-all" style="height:' +
        Math.max(2, h) +
        "%;" +
        (isNegative ? "opacity:0.8" : "") +
        '"></div>' +
        '<span class="text-[10px] ' +
        labelClass +
        ' font-bold whitespace-nowrap">' +
        d.month +
        "</span></div>";
    });
    c.innerHTML = html;
  }

  function renderExpenseDonut(allocation) {
    var svg = document.getElementById("val-expense-donut");
    var leg = document.getElementById("val-expense-legend");
    if (!svg || !leg) return;

    if (!allocation || allocation.length === 0) {
      svg.innerHTML =
        '<circle cx="50" cy="50" fill="transparent" r="40" stroke="#f2f4f7" stroke-width="12"></circle>';
      leg.innerHTML = '<p class="text-xs text-outline italic">No expenses in this period.</p>';
      return;
    }

    var colors = ["#041627", "#006d3d", "#1a2b3c", "#97f3b5", "#b7c8de", "#c4c6cd"];
    var circumference = 2 * Math.PI * 40;
    var svgHtml = "";
    var legHtml = "";
    var currentOffset = 0;

    allocation.forEach(function (item, index) {
      var pct = item.percentage;
      var strokeLength = (pct / 100) * circumference;
      var gap = circumference - strokeLength;
      var color = colors[index % colors.length];
      svgHtml +=
        '<circle fill="transparent" cx="50" cy="50" r="40" stroke="' +
        color +
        '" stroke-dasharray="' +
        strokeLength +
        " " +
        gap +
        '" stroke-dashoffset="' +
        -currentOffset +
        '" stroke-width="12"></circle>';
      currentOffset += strokeLength;
      legHtml +=
        '<div class="flex items-center justify-between gap-2">' +
        '<div class="flex items-center gap-2 min-w-0">' +
        '<span class="w-3 h-3 rounded-sm shrink-0" style="background-color:' +
        color +
        '"></span>' +
        '<span class="text-sm font-semibold text-primary truncate" title="' +
        escapeHtml(item.category) +
        '">' +
        escapeHtml(item.category) +
        "</span></div>" +
        '<span class="text-xs font-bold text-on-surface-variant shrink-0">' +
        pct.toFixed(1) +
        "%</span>" +
        '<span class="text-xs font-medium text-primary shrink-0">' +
        fmt(item.amount) +
        "</span></div>";
    });
    svg.innerHTML = svgHtml;
    leg.innerHTML = legHtml;
  }

  document.addEventListener("DOMContentLoaded", function () {
    window.setFilter("last_6_months");
  });
})();
