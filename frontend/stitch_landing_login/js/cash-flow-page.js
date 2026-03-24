/**
 * Cash Flow & Liquidity — GET /api/transactions/cash-flow/
 * Depends: config.js, auth.js, inr-format.js
 */
(function () {
  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
  var CASH_FLOW_URL = API_BASE + "/api/transactions/cash-flow/";
  var currentFilter = "last_6_months";

  function fmt(n) {
    return window.formatINR ? window.formatINR(n) : "₹" + Number(n).toFixed(2);
  }

  function apiHeaders() {
    return Object.assign(
      { Accept: "application/json" },
      window.FinSightAuth && window.FinSightAuth.authHeader ? window.FinSightAuth.authHeader() : {}
    );
  }

  function escapeHtml(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function setFilterButtons(active) {
    ["last_6_months", "ytd", "custom"].forEach(function (id) {
      var el = document.getElementById("cf-filter-" + (id === "custom" ? "custom_toggle" : id));
      if (!el) return;
      if (id === active) {
        el.className =
          "px-4 py-2 rounded-lg text-sm font-semibold bg-surface-container-lowest text-primary shadow-sm";
      } else if (id === "custom") {
        el.className = "px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-primary";
      } else {
        el.className = "px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-primary";
      }
    });
  }

  function statusUi(status) {
    var s = (status || "").toLowerCase();
    if (s === "healthy")
      return { dot: "bg-secondary", text: "text-secondary" };
    if (s === "stable") return { dot: "bg-primary/60", text: "text-primary" };
    if (s === "watchlist") return { dot: "bg-tertiary-fixed-dim", text: "text-tertiary-fixed-dim" };
    if (s === "at risk") return { dot: "bg-error", text: "text-error" };
    return { dot: "bg-outline", text: "text-primary" };
  }

  function riskBarPct(risk) {
    var r = (risk || "").toLowerCase();
    if (r === "high") return "88%";
    if (r === "medium") return "52%";
    return "28%";
  }

  function renderChart(monthly) {
    var c = document.getElementById("cf-chart-container");
    if (!c) return;
    c.innerHTML = "";
    if (!monthly || monthly.length === 0) {
      c.innerHTML =
        '<p class="text-sm text-outline m-auto">No transactions in this period for a month-wise chart.</p>';
      return;
    }

    var maxVal = 0;
    monthly.forEach(function (m) {
      maxVal = Math.max(maxVal, m.inflow || 0, m.outflow || 0);
    });
    if (maxVal === 0) maxVal = 1;

    monthly.forEach(function (m) {
      var infPct = ((m.inflow || 0) / maxVal) * 100;
      var outPct = ((m.outflow || 0) / maxVal) * 100;
      var col = document.createElement("div");
      col.className = "flex flex-col items-center gap-1 h-full justify-end flex-1 min-w-0 max-w-[4.5rem]";
      col.innerHTML =
        '<div class="flex items-end justify-center gap-0.5 w-full h-[240px]" title="' +
        escapeHtml(fmt(m.inflow) + " in · " + fmt(m.outflow) + " out") +
        '">' +
        '<div class="w-[42%] rounded-t-sm bg-secondary transition-all relative group" style="height:' +
        Math.max(4, infPct) +
        '%"><span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap bg-primary text-on-primary px-1 rounded">' +
        escapeHtml(fmt(m.inflow)) +
        "</span></div>" +
        '<div class="w-[42%] rounded-t-sm bg-primary/25 transition-all relative group" style="height:' +
        Math.max(4, outPct) +
        '%"><span class="hidden group-hover:block absolute -top-8 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap bg-primary text-on-primary px-1 rounded">' +
        escapeHtml(fmt(m.outflow)) +
        "</span></div>" +
        "</div>" +
        '<span class="text-[10px] text-outline font-bold">' +
        escapeHtml(m.month || "") +
        "</span>";
      c.appendChild(col);
    });
  }

  function renderEvents(events) {
    var el = document.getElementById("cf-events-list");
    if (!el) return;
    if (!events || events.length === 0) {
      el.innerHTML =
        '<p class="text-sm text-on-surface-variant">No notable liquidity events in this range. Add or import transactions to see large inflows, outflows, and pending items.</p>';
      return;
    }

    var icon =
      '<div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">' +
      '<span class="material-symbols-outlined text-primary text-sm">payments</span></div>';

    el.innerHTML = events
      .map(function (ev) {
        var isIn = ev.direction === "inflow";
        var amtClass = isIn ? "text-secondary" : "text-error";
        var sign = isIn ? "+" : "−";
        var sub =
          escapeHtml(ev.tag || "") +
          " · " +
          escapeHtml(ev.transaction_type || "") +
          (ev.status ? " · " + escapeHtml(ev.status) : "") +
          " · " +
          escapeHtml(ev.date || "");
        return (
          '<div class="flex gap-4 items-start">' +
          icon +
          '<div class="flex-1 min-w-0"><p class="text-sm font-bold text-primary truncate">' +
          escapeHtml(ev.title) +
          '</p><p class="text-xs text-outline font-medium">' +
          sub +
          "</p></div>" +
          '<p class="text-sm font-bold shrink-0 ' +
          amtClass +
          '">' +
          sign +
          fmt(ev.amount) +
          "</p></div>"
        );
      })
      .join("");
  }

  function applyData(data) {
    var range = data.range || {};
    var totals = data.totals || {};
    var mom = data.momentum || {};
    var opt = data.optimization || {};
    var runway = data.runway || {};
    var ar = data.accounts_receivable || {};
    var ap = data.accounts_payable || {};

    var hero = document.getElementById("cf-hero-narrative");
    if (hero) {
      var lab = (mom.label || "stable").toLowerCase();
      var spanClass =
        lab === "positive"
          ? "text-secondary font-semibold"
          : lab === "negative"
            ? "text-error font-semibold"
            : "text-primary font-semibold";
      hero.innerHTML =
        "Analyzing the narrative of your liquidity. This month reflects <span class=\"" +
        spanClass +
        '">' +
        escapeHtml(lab) +
        " momentum</span> — " +
        escapeHtml(mom.headline || "") +
        ".";
    }

    var hr = document.getElementById("cf-hero-range");
    if (hr && range.start && range.end) {
      hr.textContent = "Selected period: " + range.start + " → " + range.end;
    }

    var netEl = document.getElementById("cf-net-movement");
    if (netEl) {
      var nm = totals.net_movement;
      netEl.textContent = fmt(nm);
      netEl.className =
        "text-4xl font-headline font-bold " +
        (Number(nm) < 0 ? "text-error" : "text-secondary");
    }

    var vs = document.getElementById("cf-net-vs-prior");
    if (vs) {
      var p = totals.net_change_vs_prior_pct;
      if (p == null) {
        vs.textContent = "Prior-period comparison not available (no prior window net).";
      } else {
        var up = p >= 0;
        vs.textContent =
          (up ? "↑ " : "↓ ") +
          Math.abs(p).toFixed(1) +
          "% vs prior period net movement";
      }
    }

    var st = data.liquidity_status || "—";
    var su = statusUi(st);
    var dot = document.getElementById("cf-status-dot");
    var stxt = document.getElementById("cf-status-text");
    if (dot) dot.className = "w-3 h-3 rounded-full " + su.dot;
    if (stxt) {
      stxt.textContent = st;
      stxt.className = "font-bold " + su.text;
    }

    var pos = document.getElementById("cf-position-proxy");
    if (pos) {
      pos.textContent =
        "Overall ledger position (cumulative inflow − outflow): " + fmt(data.liquidity_position_proxy || 0);
    }

    renderChart(data.monthly_liquidity || []);

    var rm = document.getElementById("cf-runway-months");
    var rc = document.getElementById("cf-runway-copy");
    if (rm && rc) {
      if (runway.months != null && runway.months > 0 && !isNaN(runway.months)) {
        var display = runway.months >= 120 ? "120+" : runway.months >= 24 ? runway.months.toFixed(0) : runway.months.toFixed(1);
        rm.textContent = display + " mo";
        rc.textContent =
          "Based on cumulative position " +
          fmt(data.liquidity_position_proxy || 0) +
          " and average monthly outflow " +
          fmt(runway.avg_monthly_outflow || 0) +
          " in this window.";
      } else {
        rm.textContent = "N/A";
        rc.textContent =
          Number(data.liquidity_position_proxy) <= 0
            ? "Cumulative net movement is not positive or average outflow is zero—runway cannot be estimated from the current ledger."
            : "Not enough monthly outflow in range to estimate runway.";
      }
    }

    var rl = document.getElementById("cf-risk-label");
    var rb = document.getElementById("cf-risk-bar");
    if (rl) rl.textContent = (data.risk_exposure || "Low") + " Risk";
    if (rb) {
      rb.style.width = riskBarPct(data.risk_exposure);
      rb.className =
        "h-full rounded-full transition-all duration-700 " +
        ((data.risk_exposure || "").toLowerCase() === "high"
          ? "bg-error"
          : (data.risk_exposure || "").toLowerCase() === "medium"
            ? "bg-tertiary-fixed-dim"
            : "bg-secondary");
    }

    var arAmt = document.getElementById("cf-ar-amount");
    var arCt = document.getElementById("cf-ar-count");
    var arBd = document.getElementById("cf-ar-badge");
    if (arAmt) arAmt.textContent = fmt(ar.total || 0);
    if (arCt)
      arCt.textContent =
        (ar.count || 0) +
        " pending revenue line(s) — mark CLEARED when cash is received.";
    if (arBd) arBd.textContent = (ar.count || 0) > 0 ? "OPEN" : "NONE";

    var apAmt = document.getElementById("cf-ap-amount");
    var apCt = document.getElementById("cf-ap-count");
    var apBd = document.getElementById("cf-ap-badge");
    if (apAmt) apAmt.textContent = fmt(ap.total || 0);
    if (apCt)
      apCt.textContent =
        (ap.count || 0) +
        " pending expense line(s) — mark CLEARED when paid.";
    if (apBd) apBd.textContent = (ap.count || 0) > 0 ? "DUE" : "CLEAR";

    renderEvents(data.liquidity_events || []);

    var os = document.getElementById("cf-opt-summary");
    var ol = document.getElementById("cf-opt-strategies");
    if (os) os.textContent = opt.summary || "";
    if (ol) {
      var strats = opt.strategies || [];
      if (strats.length) {
        ol.classList.remove("hidden");
        ol.innerHTML = strats.map(function (s) {
          return "<li>" + escapeHtml(s) + "</li>";
        }).join("");
      } else {
        ol.classList.add("hidden");
        ol.innerHTML = "";
      }
    }
  }

  async function fetchCashFlow() {
    var url = CASH_FLOW_URL + "?range=" + encodeURIComponent(currentFilter);
    if (currentFilter === "custom") {
      var d1 = document.getElementById("cf-custom-start");
      var d2 = document.getElementById("cf-custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        url += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }

    try {
      var res = await fetch(url, { headers: apiHeaders(), credentials: "omit" });
      if (res.status === 401) {
        console.warn("Cash flow: unauthorized");
        return;
      }
      if (!res.ok) throw new Error("Cash flow fetch failed");
      var data = await res.json();
      applyData(data);
    } catch (e) {
      console.error(e);
      var hero = document.getElementById("cf-hero-narrative");
      if (hero)
        hero.textContent =
          "Could not load cash flow data. Ensure the backend is running and you are signed in, then refresh.";
    }
  }

  window.cfSetFilter = function (range) {
    currentFilter = range;
    setFilterButtons(range === "custom" ? "custom" : range);
    if (range === "custom") {
      var cr = document.getElementById("cf-custom-range");
      if (cr) cr.classList.remove("hidden");
    } else {
      var cr2 = document.getElementById("cf-custom-range");
      if (cr2) cr2.classList.add("hidden");
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var b1 = document.getElementById("cf-filter-last_6_months");
    var b2 = document.getElementById("cf-filter-ytd");
    var b3 = document.getElementById("cf-filter-custom_toggle");
    var b4 = document.getElementById("cf-filter-custom_apply");
    if (b1)
      b1.addEventListener("click", function () {
        window.cfSetFilter("last_6_months");
        fetchCashFlow();
      });
    if (b2)
      b2.addEventListener("click", function () {
        window.cfSetFilter("ytd");
        fetchCashFlow();
      });
    if (b3)
      b3.addEventListener("click", function () {
        window.cfSetFilter("custom");
      });
    if (b4)
      b4.addEventListener("click", function () {
        currentFilter = "custom";
        setFilterButtons("custom");
        fetchCashFlow();
      });

    setFilterButtons("last_6_months");
    fetchCashFlow();
  });
})();
