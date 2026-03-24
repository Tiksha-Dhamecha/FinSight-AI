/**
 * Operational Performance — GET /api/transactions/operations/
 * Depends: config.js, auth.js, inr-format.js
 */
(function () {
  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
  var OPS_URL = API_BASE + "/api/transactions/operations/";

  function fmt(n) {
    return window.formatINR ? window.formatINR(n) : "₹" + Number(n).toFixed(2);
  }

  function apiHeaders() {
    return Object.assign(
      { Accept: "application/json" },
      window.FinSightAuth && window.FinSightAuth.authHeader ? window.FinSightAuth.authHeader() : {}
    );
  }

  function fmtGrowth(g) {
    if (g > 0) return "+" + g + "%";
    return g + "%";
  }

  async function loadData(range) {
    var url = OPS_URL + "?range=" + encodeURIComponent(range);
    if (range === "custom") {
      var d1 = document.getElementById("ops-custom-start");
      var d2 = document.getElementById("ops-custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        url += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }
    try {
      var res = await fetch(url, { headers: apiHeaders(), credentials: "omit" });
      if (res.status === 401) throw new Error("unauthorized");
      if (!res.ok) throw new Error("API " + res.status);
      return await res.json();
    } catch (e) {
      console.error("Ops API:", e);
      return null;
    }
  }

  function renderKPIs(d) {
    var oc = document.getElementById("kpi-orders-completed");
    if (oc) oc.textContent = String(d.orders_completed != null ? d.orders_completed : "—");
    var cs = document.getElementById("kpi-completed-sub");
    if (cs)
      cs.textContent =
        (d.total_operational != null ? d.total_operational : 0) + " operational lines (Revenue/Expense)";

    var or = document.getElementById("kpi-orders-rejected");
    if (or) or.textContent = String(d.orders_rejected != null ? d.orders_rejected : "—");
    var rs = document.getElementById("kpi-rejected-sub");
    if (rs) {
      var tot = d.total_operational || 0;
      var rej = d.orders_rejected || 0;
      var rate = tot > 0 ? ((rej / tot) * 100).toFixed(1) : "0.0";
      rs.textContent = rate + "% rejection / cancel signal rate";
    }

    var ful = document.getElementById("kpi-fulfillment");
    if (ful) ful.textContent = (d.fulfillment_efficiency != null ? d.fulfillment_efficiency : "—") + "%";
    var fs = document.getElementById("kpi-fulfillment-sub");
    if (fs) {
      var eff = Number(d.fulfillment_efficiency) || 0;
      var lab =
        eff >= 90 ? "Strong" : eff >= 75 ? "Stable" : eff >= 60 ? "Weak" : "At Risk";
      fs.textContent = lab + " — " + (d.late_fulfillment != null ? d.late_fulfillment : 0) + " late/overdue";
    }

    var gr = document.getElementById("kpi-growth");
    if (gr) gr.textContent = fmtGrowth(d.growth_rate != null ? d.growth_rate : 0);
    var gSub = document.getElementById("kpi-growth-sub");
    if (gSub) {
      var isPos = (d.growth_rate || 0) >= 0;
      gSub.innerHTML =
        '<span class="material-symbols-outlined text-sm ' +
        (isPos ? "text-secondary" : "text-error") +
        '">' +
        (isPos ? "trending_up" : "trending_down") +
        "</span><span class=\"" +
        (isPos ? "text-secondary" : "text-error") +
        ' font-bold">' +
        (isPos ? "Positive" : "Negative") +
        " vs prior window</span>";
    }

    var pl = document.getElementById("ops-period-label");
    if (pl && d.period) pl.textContent = "Period: " + d.period.start + " → " + d.period.end;
  }

  function renderProcessingPanel(d) {
    var pt = document.getElementById("kpi-proc-time");
    if (pt) pt.textContent = d.avg_processing_time_hours != null ? String(d.avg_processing_time_hours) : "—";
    var lf = document.getElementById("kpi-late");
    if (lf) lf.textContent = d.late_fulfillment != null ? String(d.late_fulfillment) : "—";
    var es = document.getElementById("kpi-eff-stat");
    if (es) es.textContent = (d.fulfillment_efficiency != null ? d.fulfillment_efficiency : "—") + "%";

    var latePct =
      d.total_operational > 0
        ? Math.min(100, ((d.late_fulfillment || 0) / d.total_operational) * 100)
        : 0;
    var lb = document.getElementById("kpi-late-bar");
    if (lb) lb.style.width = latePct + "%";
    var eb = document.getElementById("kpi-eff-bar");
    if (eb) eb.style.width = Math.min(100, d.fulfillment_efficiency || 0) + "%";

    var trend = d.processing_time_trend || "stable";
    var trendMap = {
      improvement: {
        text:
          "Processing proxy improved to " +
          (d.avg_processing_time_hours || 0) +
          "h (was " +
          (d.prior_avg_processing_time_hours || 0) +
          "h). Entry is closer to transaction dates.",
        icon: "trending_down",
        label: "Improving",
        cls: "bg-secondary text-on-secondary",
      },
      decline: {
        text:
          "Processing proxy increased to " +
          (d.avg_processing_time_hours || 0) +
          "h (was " +
          (d.prior_avg_processing_time_hours || 0) +
          "h). Check import lag or backdating.",
        icon: "trending_up",
        label: "Slower",
        cls: "bg-error text-on-error",
      },
      stable: {
        text:
          "Processing proxy is stable at " +
          (d.avg_processing_time_hours || 0) +
          "h vs " +
          (d.prior_avg_processing_time_hours || 0) +
          "h prior window.",
        icon: "trending_flat",
        label: "Stable",
        cls: "bg-primary-container text-on-primary-container",
      },
    };
    var t = trendMap[trend] || trendMap.stable;
    var tt = document.getElementById("kpi-proc-trend-text");
    if (tt) tt.textContent = t.text;
    var pill = document.getElementById("kpi-proc-trend-pill");
    if (pill) {
      pill.innerHTML = '<span class="material-symbols-outlined text-sm">' + t.icon + "</span> " + t.label;
      pill.className =
        "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold mb-6 " + t.cls;
    }
  }

  function renderChart(d) {
    var chartEl = document.getElementById("velocity-chart");
    var labelsEl = document.getElementById("velocity-labels");
    var emptyEl = document.getElementById("chart-empty");
    var area = document.getElementById("velocity-chart-area");
    if (!chartEl || !labelsEl || !emptyEl) return;

    var graph = d.velocity_graph || [];
    var totalVol = graph.reduce(function (s, x) {
      return s + (x.volume || 0);
    }, 0);
    var totalRev = graph.reduce(function (s, x) {
      return s + (x.revenue || 0);
    }, 0);

    if (totalVol === 0 && totalRev === 0) {
      if (area) area.style.display = "none";
      labelsEl.style.display = "none";
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");
    if (area) area.style.display = "";
    labelsEl.style.display = "";

    var maxVol = Math.max.apply(
      null,
      graph.map(function (x) {
        return x.volume || 0;
      }).concat([1])
    );
    var maxRev = Math.max.apply(
      null,
      graph.map(function (x) {
        return x.revenue || 0;
      }).concat([1])
    );

    chartEl.innerHTML = "";
    labelsEl.innerHTML = "";

    graph.forEach(function (day) {
      var revPct = Math.max(2, ((day.revenue || 0) / maxRev) * 100);
      var volPct = Math.max(2, ((day.volume || 0) / maxVol) * 100);

      var group = document.createElement("div");
      group.className = "bar-group flex flex-col items-center flex-1";
      group.style.height = "100%";
      group.title =
        day.day + " — Volume: " + (day.volume || 0) + " | Revenue: " + fmt(day.revenue || 0);

      group.innerHTML =
        '<div class="flex items-end justify-center gap-1 w-full" style="height:100%">' +
        '<div class="chart-bar rounded-t-md w-4" style="height:' +
        revPct +
        '%; background: rgba(4,22,39,0.75);" title="Revenue"></div>' +
        '<div class="chart-bar rounded-t-md w-4" style="height:' +
        volPct +
        '%; background: rgba(0,109,61,0.75);" title="Volume"></div>' +
        "</div>";

      chartEl.appendChild(group);

      var lbl = document.createElement("div");
      lbl.className = "flex-1 text-center text-[10px] text-slate-400 font-bold leading-6";
      lbl.textContent = day.day;
      labelsEl.appendChild(lbl);
    });
  }

  function renderStrategy(d) {
    var strat = d.strategy || {};
    var grid = document.getElementById("strategy-grid");
    var badge = document.getElementById("strategy-badge");
    var dot = document.getElementById("strategy-dot");
    var label = document.getElementById("strategy-status-label");
    var pulse = document.getElementById("strategy-pulse");
    var sumEl = document.getElementById("strategy-summary");

    var statusMap = {
      Optimal: {
        dot: "#006d3d",
        badge: "bg-secondary-container text-on-secondary-container",
        pulse: "#006d3d",
      },
      Efficient: {
        dot: "#006d3d",
        badge: "bg-secondary-container text-on-secondary-container",
        pulse: "#006d3d",
      },
      Stable: {
        dot: "#b88900",
        badge: "bg-tertiary-fixed text-on-tertiary-container",
        pulse: "#b88900",
      },
      "Needs Attention": {
        dot: "#b88900",
        badge: "bg-tertiary-fixed text-on-tertiary-container",
        pulse: "#b88900",
      },
      "At Risk": {
        dot: "#ba1a1a",
        badge: "bg-error-container text-on-error-container",
        pulse: "#ba1a1a",
      },
      "No Data": {
        dot: "#74777d",
        badge: "bg-surface-container text-on-surface-variant",
        pulse: "#74777d",
      },
    };
    var st = strat.status || "Stable";
    var sc = statusMap[st] || statusMap.Stable;

    if (dot) dot.style.background = sc.dot;
    if (badge)
      badge.className =
        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold " + sc.badge;
    if (pulse) pulse.style.background = sc.pulse;
    if (label) label.textContent = st;
    if (sumEl) sumEl.textContent = strat.summary || "";

    var isHealthy = st === "Optimal" || st === "Efficient";

    if (!grid) return;
    if (!strat.recommendations || strat.recommendations.length === 0) {
      grid.innerHTML =
        '<div class="col-span-2 text-center py-8 text-on-surface-variant text-sm">No extra recommendations for this snapshot.</div>';
      return;
    }

    grid.innerHTML = "";
    strat.recommendations.forEach(function (rec, idx) {
      var icon = isHealthy ? "check_circle" : idx === 0 ? "priority_high" : "info";
      var icCls = isHealthy
        ? "bg-secondary-container text-on-secondary-container"
        : idx === 0
          ? "bg-error-container text-on-error-container"
          : "bg-tertiary-fixed text-on-tertiary-container";

      var card = document.createElement("div");
      card.className = "flex gap-4 p-5 bg-surface-container-low rounded-xl";
      card.innerHTML =
        '<div class="w-11 h-11 rounded-xl ' +
        icCls +
        ' flex items-center justify-center flex-shrink-0">' +
        '<span class="material-symbols-outlined text-sm" style="font-variation-settings:\'FILL\' 1;">' +
        icon +
        "</span></div>" +
        "<div><h4 class=\"font-bold text-primary text-sm mb-1\">" +
        (isHealthy ? "Insight" : "Action") +
        '</h4><p class="text-xs text-on-surface-variant leading-relaxed"></p></div>';
      card.querySelector("p").textContent = rec;
      grid.appendChild(card);
    });
  }

  function showLoadError() {
    var ids = [
      "kpi-orders-completed",
      "kpi-orders-rejected",
      "kpi-fulfillment",
      "kpi-growth",
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
    var s = document.getElementById("strategy-summary");
    if (s) s.textContent = "Could not load operations data. Check backend and sign-in (Token auth).";
  }

  async function refresh() {
    var rangeEl = document.getElementById("range-select");
    var range = rangeEl ? rangeEl.value : "last_6_months";
    if (range === "custom") {
      var d1 = document.getElementById("ops-custom-start");
      var d2 = document.getElementById("ops-custom-end");
      if (!d1 || !d2 || !d1.value || !d2.value) return;
    }
    var data = await loadData(range);
    if (!data) {
      showLoadError();
      return;
    }
    renderKPIs(data);
    renderProcessingPanel(data);
    renderChart(data);
    renderStrategy(data);
  }

  function setupNavUser() {
    if (!window.FinSightAuth || !window.FinSightAuth.fetchMe) return;
    window.FinSightAuth.fetchMe()
      .then(function (payload) {
        var u = payload && payload.user;
        var name = (u && (u.username || u.email)) || "User";
        var nav = document.getElementById("nav-user-name");
        if (nav) nav.textContent = name;
      })
      .catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupNavUser();

    var rangeEl = document.getElementById("range-select");
    var customWrap = document.getElementById("ops-custom-range");
    var applyBtn = document.getElementById("ops-custom-apply");

    if (rangeEl) {
      rangeEl.addEventListener("change", function () {
        if (rangeEl.value === "custom") {
          if (customWrap) customWrap.classList.remove("hidden");
        } else {
          if (customWrap) customWrap.classList.add("hidden");
          refresh();
        }
      });
    }
    if (applyBtn) applyBtn.addEventListener("click", refresh);

    var exp = document.getElementById("export-btn");
    if (exp) exp.addEventListener("click", function () {
      window.print();
    });

    refresh();
  });
})();
