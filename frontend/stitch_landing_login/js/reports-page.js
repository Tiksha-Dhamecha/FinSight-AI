/**
 * Executive Reports — GET /api/transactions/reports/
 * Depends: config.js, auth.js, inr-format.js
 */
(function () {
  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
  var REPORTS_URL = API_BASE + "/api/transactions/reports/";
  /** Path from landing_login/ back to this Reports page (used in ?next= after login). */
  var REPORT_RETURN_REL = "../financial_atelier_executive_dashboard/code.html";
  var currentFilter = "last_6_months";

  function getToken() {
    return window.FinSightAuth && window.FinSightAuth.getToken && window.FinSightAuth.getToken();
  }

  function showAuthGate(reason) {
    var load = document.getElementById("rep-loading");
    var content = document.getElementById("rep-content");
    var gate = document.getElementById("rep-auth-required");
    var link = document.getElementById("rep-login-link");
    var sub = document.getElementById("rep-auth-sub");
    if (load) load.classList.add("hidden");
    if (content) content.classList.add("hidden");
    if (gate) gate.classList.remove("hidden");
    if (link) {
      link.setAttribute(
        "href",
        "../landing_login/code.html?next=" + encodeURIComponent(REPORT_RETURN_REL)
      );
    }
    if (sub) {
      sub.textContent =
        reason === "expired"
          ? "Your session is missing or no longer valid. Sign in again to load data from your ledger."
          : "Sign in to view your company financial report from stored transactions.";
    }
  }

  function hideAuthGate() {
    var gate = document.getElementById("rep-auth-required");
    if (gate) gate.classList.add("hidden");
  }

  function fmt(n) {
    if (n === null || n === undefined) return "—";
    return window.formatINR ? window.formatINR(n) : "₹" + Number(n).toFixed(2);
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return "—";
    return Number(n).toFixed(1) + "%";
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
      var el = document.getElementById("rep-filter-" + id);
      if (!el) return;
      if (id === active) {
        el.className =
          "px-5 py-2 rounded-lg text-sm font-semibold bg-primary text-on-primary shadow-sm transition-colors";
      } else {
        el.className =
          "px-5 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-primary transition-colors";
      }
    });
  }

  async function fetchReport() {
    var url = REPORTS_URL + "?range=" + encodeURIComponent(currentFilter);
    if (currentFilter === "custom") {
      var d1 = document.getElementById("rep-custom-start");
      var d2 = document.getElementById("rep-custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        url += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }
    var res = await fetch(url, { headers: apiHeaders(), credentials: "omit" });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("reports failed");
    return res.json();
  }

  function renderExecutive(data) {
    var box = document.getElementById("rep-executive-text");
    if (!box) return;
    var paras = (data.executive_summary && data.executive_summary.paragraphs) || [];
    if (!paras.length) {
      box.innerHTML =
        '<p class="text-on-surface-variant">No summary available. Add transactions for the selected period.</p>';
      return;
    }
    box.innerHTML = paras
      .map(function (p) {
        return '<p class="text-on-surface leading-relaxed mb-4 last:mb-0">' + escapeHtml(p) + "</p>";
      })
      .join("");
  }

  function renderPlStrip(data) {
    var pl = data.profit_loss || {};
    var strip = document.getElementById("rep-pl-strip");
    var title = document.getElementById("rep-pl-title");
    var sub = document.getElementById("rep-pl-sub");
    if (!strip || !title || !sub) return;
    var st = pl.status || "breakeven";
    var cls =
      st === "profit"
        ? "from-secondary/20 to-secondary/5 border-secondary/30"
        : st === "loss"
          ? "from-error/15 to-error/5 border-error/30"
          : "from-outline-variant/20 to-surface-container-low border-outline-variant/30";
    strip.className =
      "rounded-2xl p-8 mb-10 border bg-gradient-to-br " + cls;
    title.textContent =
      st === "profit"
        ? "In Profit"
        : st === "loss"
          ? "In Loss"
          : "Near Break-even";
    var bits = [escapeHtml(pl.headline || "")];
    if (pl.improving) bits.push("Revenue trend vs prior period: improving.");
    if (pl.declining) bits.push("Revenue trend vs prior period: declining.");
    bits.push("EBITDA (operating proxy): " + fmt(pl.ebitda || 0));
    sub.innerHTML = bits.map(function (b) {
      return "<p class=\"text-sm text-on-surface-variant mt-2\">" + b + "</p>";
    }).join("");
  }

  function renderKpis(data) {
    var k = data.kpis || {};
    var map = [
      ["rep-kpi-revenue", fmt(k.gross_revenue)],
      ["rep-kpi-expense", fmt(k.total_expenses)],
      ["rep-kpi-net", fmt(k.net_profit)],
      ["rep-kpi-margin", fmtPct(k.profit_margin_pct)],
      ["rep-kpi-ebitda", fmt((data.ebitda && data.ebitda.value) || 0)],
      ["rep-kpi-ebitda-m", fmtPct(data.ebitda && data.ebitda.margin_pct)],
      ["rep-kpi-ncf", fmt(k.net_cash_flow)],
      ["rep-kpi-ar", fmt(k.accounts_receivable)],
      ["rep-kpi-ap", fmt(k.accounts_payable)],
      ["rep-kpi-mar", fmt(k.monthly_average_revenue)],
      ["rep-kpi-mae", fmt(k.monthly_average_expense)],
      ["rep-kpi-burn", k.burn_rate_monthly != null ? fmt(k.burn_rate_monthly) : "—"],
      ["rep-kpi-rev-gr", k.revenue_growth_pct != null ? fmtPct(k.revenue_growth_pct) : "—"],
      ["rep-kpi-exp-gr", k.expense_growth_pct != null ? fmtPct(k.expense_growth_pct) : "—"],
      ["rep-kpi-eff", k.operating_efficiency_score != null ? String(k.operating_efficiency_score) : "—"],
      ["rep-kpi-health", k.financial_health_score != null ? String(k.financial_health_score) : "—"],
    ];
    map.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.textContent = pair[1];
    });
  }

  function renderCondition(data) {
    var fc = data.financial_condition || {};
    var el = document.getElementById("rep-condition-label");
    var ex = document.getElementById("rep-condition-expl");
    var sc = document.getElementById("rep-condition-score");
    if (el) el.textContent = fc.label || "—";
    if (ex) ex.textContent = fc.explanation || "";
    if (sc) sc.textContent = fc.score != null ? fc.score + " / 100" : "—";
  }

  function renderLoan(data) {
    var lr = data.loan_readiness || {};
    var el = document.getElementById("rep-loan-label");
    var sc = document.getElementById("rep-loan-score");
    var disc = document.getElementById("rep-loan-disclaimer");
    var ul = document.getElementById("rep-loan-factors");
    if (el) el.textContent = lr.label || "—";
    if (sc) sc.textContent = lr.score != null ? lr.score + " / 100" : "—";
    if (disc) disc.textContent = lr.disclaimer || "";
    if (ul) {
      ul.innerHTML = (lr.factors || [])
        .map(function (f) {
          return "<li class=\"text-sm text-on-surface-variant leading-relaxed\">" + escapeHtml(f) + "</li>";
        })
        .join("");
    }
  }

  function renderRecommendations(data) {
    var ul = document.getElementById("rep-recommendations");
    if (!ul) return;
    var recs = data.recommendations || [];
    ul.innerHTML = recs
      .map(function (r) {
        return (
          '<li class="flex gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">' +
          '<span class="material-symbols-outlined text-secondary shrink-0">chevron_right</span>' +
          '<span class="text-sm text-on-surface leading-relaxed">' +
          escapeHtml(r) +
          "</span></li>"
        );
      })
      .join("");
  }

  function renderCharts(data) {
    var charts = data.charts || {};
    var trend = charts.monthly_trend || [];
    var ebitdaT = charts.ebitda_trend || [];
    var alloc = charts.expense_allocation || [];
    var rp = charts.receivable_payable || {};

    var revExpEl = document.getElementById("rep-chart-rev-exp");
    if (revExpEl) {
      revExpEl.innerHTML = "";
      if (!trend.length) {
        revExpEl.innerHTML = '<p class="text-sm text-outline">No monthly points in range.</p>';
      } else {
        var maxR = Math.max.apply(
          null,
          trend.map(function (m) {
            return Math.max(m.revenue || 0, m.expenses || 0);
          }).concat([1])
        );
        trend.forEach(function (m) {
          var col = document.createElement("div");
          col.className = "flex flex-col items-center gap-1 flex-1 min-w-0";
          var rpct = Math.max(4, ((m.revenue || 0) / maxR) * 100);
          var epct = Math.max(4, ((m.expenses || 0) / maxR) * 100);
          col.innerHTML =
            '<div class="flex items-end gap-0.5 h-36 w-full justify-center">' +
            '<div class="w-3 rounded-t bg-primary" style="height:' +
            rpct +
            '%" title="' +
            escapeHtml(fmt(m.revenue)) +
            '"></div>' +
            '<div class="w-3 rounded-t bg-secondary/70" style="height:' +
            epct +
            '%" title="' +
            escapeHtml(fmt(m.expenses)) +
            '"></div></div>' +
            '<span class="text-[10px] font-bold text-outline">' +
            escapeHtml(m.month || "") +
            "</span>";
          revExpEl.appendChild(col);
        });
      }
    }

    var ebEl = document.getElementById("rep-chart-ebitda");
    if (ebEl) {
      ebEl.innerHTML = "";
      if (!ebitdaT.length) {
        ebEl.innerHTML = '<p class="text-sm text-outline">No EBITDA trend points.</p>';
      } else {
        var maxE = Math.max.apply(
          null,
          ebitdaT.map(function (x) {
            return Math.abs(x.ebitda || 0);
          }).concat([1])
        );
        ebitdaT.forEach(function (x) {
          var col = document.createElement("div");
          col.className = "flex flex-col items-center gap-1 flex-1 min-w-0";
          var v = x.ebitda || 0;
          var h = Math.max(4, (Math.abs(v) / maxE) * 100);
          var bg = v >= 0 ? "bg-secondary" : "bg-error";
          col.innerHTML =
            '<div class="flex items-end h-28 w-full justify-center">' +
            '<div class="w-4 rounded-t ' +
            bg +
            '" style="height:' +
            h +
            '%"></div></div>' +
            '<span class="text-[10px] font-bold text-outline">' +
            escapeHtml(x.month || "") +
            "</span>";
          ebEl.appendChild(col);
        });
      }
    }

    var alEl = document.getElementById("rep-chart-alloc");
    if (alEl) {
      alEl.innerHTML = "";
      if (!alloc.length) {
        alEl.innerHTML = '<p class="text-sm text-outline">No expense allocation.</p>';
      } else {
        alloc.forEach(function (a) {
          var row = document.createElement("div");
          row.className = "mb-3";
          row.innerHTML =
            '<div class="flex justify-between text-xs font-semibold mb-1"><span class="truncate pr-2">' +
            escapeHtml(a.category) +
            "</span><span>" +
            fmt(a.amount) +
            "</span></div>" +
            '<div class="h-2 bg-surface-container-high rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full" style="width:' +
            Math.min(100, a.percentage || 0) +
            '%"></div></div>';
          alEl.appendChild(row);
        });
      }
    }

    var ar = rp.receivable || 0;
    var ap = rp.payable || 0;
    var tot = ar + ap || 1;
    var arp = document.getElementById("rep-ar-bar");
    var app = document.getElementById("rep-ap-bar");
    if (arp) arp.style.width = (ar / tot) * 100 + "%";
    if (app) app.style.width = (ap / tot) * 100 + "%";
    var arL = document.getElementById("rep-ar-label");
    var apL = document.getElementById("rep-ap-label");
    if (arL) arL.textContent = "Receivables " + fmt(ar);
    if (apL) apL.textContent = "Payables " + fmt(ap);

    var profitEl = document.getElementById("rep-chart-profit");
    if (profitEl) {
      profitEl.innerHTML = "";
      if (!trend.length) {
        profitEl.innerHTML = '<p class="text-sm text-outline">No monthly data.</p>';
      } else {
        var maxP = Math.max.apply(
          null,
          trend.map(function (m) {
            return Math.abs(m.profit || 0);
          }).concat([1])
        );
        trend.forEach(function (m) {
          var col = document.createElement("div");
          col.className = "flex flex-col items-center gap-1 flex-1 min-w-0";
          var v = m.profit || 0;
          var h = Math.max(4, (Math.abs(v) / maxP) * 100);
          var bg = v >= 0 ? "bg-secondary" : "bg-error";
          col.innerHTML =
            '<div class="flex items-end h-28 w-full justify-center">' +
            '<div class="w-4 rounded-t ' +
            bg +
            '" style="height:' +
            h +
            '%" title="' +
            escapeHtml(fmt(v)) +
            '"></div></div>' +
            '<span class="text-[10px] font-bold text-outline">' +
            escapeHtml(m.month || "") +
            "</span>";
          profitEl.appendChild(col);
        });
      }
    }

    var cfM = charts.monthly_cash_flow || [];
    var cfEl = document.getElementById("rep-chart-cashflow");
    if (cfEl) {
      cfEl.innerHTML = "";
      if (!cfM.length) {
        cfEl.innerHTML = '<p class="text-sm text-outline">No cash movement by month.</p>';
      } else {
        var maxC = Math.max.apply(
          null,
          cfM.map(function (x) {
            return Math.max(x.inflow || 0, x.outflow || 0);
          }).concat([1])
        );
        cfM.forEach(function (x) {
          var col = document.createElement("div");
          col.className = "flex flex-col items-center gap-1 flex-1 min-w-0";
          var ip = Math.max(4, ((x.inflow || 0) / maxC) * 100);
          var op = Math.max(4, ((x.outflow || 0) / maxC) * 100);
          col.innerHTML =
            '<div class="flex items-end gap-0.5 h-28 w-full justify-center">' +
            '<div class="w-3 rounded-t bg-secondary" style="height:' +
            ip +
            '%" title="In ' +
            escapeHtml(fmt(x.inflow)) +
            '"></div>' +
            '<div class="w-3 rounded-t bg-primary/50" style="height:' +
            op +
            '%" title="Out ' +
            escapeHtml(fmt(x.outflow)) +
            '"></div></div>' +
            '<span class="text-[10px] font-bold text-outline">' +
            escapeHtml(x.month || "") +
            "</span>";
          cfEl.appendChild(col);
        });
      }
    }
  }

  function renderHealthGauge(score) {
    var el = document.getElementById("rep-health-gauge");
    if (!el) return;
    var s = Math.max(0, Math.min(100, Number(score) || 0));
    el.style.setProperty("--p", s + "%");
  }

  async function refresh() {
    setFilterButtons(currentFilter === "custom" ? "custom" : currentFilter);

    if (!getToken()) {
      showAuthGate("missing");
      return;
    }

    hideAuthGate();
    var loadEl = document.getElementById("rep-loading");
    var contentEl = document.getElementById("rep-content");
    if (loadEl) {
      loadEl.classList.remove("hidden");
      loadEl.textContent = "Building your executive report from live data…";
    }
    if (contentEl) contentEl.classList.add("hidden");

    try {
      var data = await fetchReport();
      if (loadEl) loadEl.classList.add("hidden");
      if (contentEl) contentEl.classList.remove("hidden");

      var rl = document.getElementById("rep-range-label");
      if (rl && data.range) rl.textContent = data.range.start + " → " + data.range.end;

      renderExecutive(data);
      renderPlStrip(data);
      renderKpis(data);
      renderCondition(data);
      renderLoan(data);
      renderRecommendations(data);
      renderCharts(data);
      renderHealthGauge((data.kpis && data.kpis.financial_health_score) || 0);

      var bm = document.getElementById("rep-business-metrics");
      if (bm && data.business_metrics) {
        var b = data.business_metrics;
        bm.innerHTML =
          '<p class="text-sm text-on-surface-variant">' +
          escapeHtml(b.receivable_collection_note || "") +
          " " +
          escapeHtml(b.payable_pressure_note || "") +
          "</p>" +
          (b.expense_concentration
            ? '<p class="text-sm text-tertiary-fixed-dim mt-2 font-medium">' +
              escapeHtml(b.expense_concentration) +
              "</p>"
            : "");
      }

      var ebNote = document.getElementById("rep-ebitda-note");
      if (ebNote && data.ebitda) ebNote.textContent = data.ebitda.method_note || "";
    } catch (e) {
      console.error(e);
      var msg = String((e && e.message) || "");
      if (msg.indexOf("unauthorized") !== -1 || msg.indexOf("401") !== -1) {
        if (window.FinSightAuth && window.FinSightAuth.setToken) window.FinSightAuth.setToken(null);
        showAuthGate("expired");
      } else {
        if (loadEl) {
          loadEl.classList.remove("hidden");
          loadEl.textContent =
            "Could not load report. Check that the API is running and your network connection.";
        }
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    var cr = document.getElementById("rep-custom-range");
    function hideCustom() {
      if (cr) cr.classList.add("hidden");
    }
    function showCustom() {
      if (cr) cr.classList.remove("hidden");
    }

    var b1 = document.getElementById("rep-filter-last_6_months");
    var b2 = document.getElementById("rep-filter-ytd");
    var b3 = document.getElementById("rep-filter-custom");
    var b4 = document.getElementById("rep-custom-apply");
    if (b1)
      b1.addEventListener("click", function () {
        currentFilter = "last_6_months";
        hideCustom();
        setFilterButtons("last_6_months");
        refresh();
      });
    if (b2)
      b2.addEventListener("click", function () {
        currentFilter = "ytd";
        hideCustom();
        setFilterButtons("ytd");
        refresh();
      });
    if (b3)
      b3.addEventListener("click", function () {
        currentFilter = "custom";
        setFilterButtons("custom");
        showCustom();
      });
    if (b4)
      b4.addEventListener("click", function () {
        currentFilter = "custom";
        setFilterButtons("custom");
        refresh();
      });
    setFilterButtons("last_6_months");
    refresh();
  });
})();
