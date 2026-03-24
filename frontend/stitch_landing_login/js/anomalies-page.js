/**
 * Anomalies page — same analytics API, highlights expense / pattern signals from real transactions.
 */
(function () {
  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "");
  var currentFilter = "last_6_months";

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
    load();
  };

  function headers() {
    return Object.assign(
      { Accept: "application/json" },
      window.FinSightAuth && window.FinSightAuth.authHeader ? window.FinSightAuth.authHeader() : {}
    );
  }

  function fmt(n) {
    return window.formatINR ? window.formatINR(n) : "₹" + Number(n).toFixed(2);
  }

  function esc(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function cardClass(sev) {
    if (sev === "high") return "border-error";
    if (sev === "medium") return "border-tertiary-fixed-dim";
    return "border-outline-variant";
  }

  function badgeClass(sev) {
    if (sev === "high") return "bg-error-container text-on-error-container";
    if (sev === "medium") return "bg-tertiary-fixed text-on-tertiary-fixed";
    return "bg-surface-container-high text-on-surface-variant";
  }

  function badgeLabel(sev) {
    if (sev === "high") return "High severity";
    if (sev === "medium") return "Medium severity";
    return "Low severity";
  }

  async function load() {
    var hero = document.getElementById("anomalies-hero-text");
    var root = document.getElementById("anomalies-cards-root");
    var hist = document.getElementById("anomalies-history-blurb");
    if (!root) return;

    var url = API_BASE + "/api/transactions/analytics/?range=" + encodeURIComponent(currentFilter);
    if (currentFilter === "custom") {
      var d1 = document.getElementById("custom-start");
      var d2 = document.getElementById("custom-end");
      if (d1 && d2 && d1.value && d2.value) {
        url += "&start_date=" + encodeURIComponent(d1.value) + "&end_date=" + encodeURIComponent(d2.value);
      }
    }

    try {
      var res = await fetch(url, { headers: headers(), credentials: "omit" });
      if (!res.ok) throw new Error("fetch failed");
      var data = await res.json();
      var items = (data.anomalies || []).filter(function (a) {
        return a.title && a.title.indexOf("No strong anomalies") === -1;
      });
      var all = data.anomalies || [];

      if (hero) {
        var r = data.range || {};
        var base =
          "Signals below are derived from your stored transactions" +
          (r.start && r.end ? " (" + r.start + " – " + r.end + "). " : ". ");
        hero.textContent =
          base +
          (items.length
            ? items.length + " notable pattern(s) in the loaded range."
            : "No strong deviations vs the prior window — add more history for richer checks.");
      }

      if (hist) {
        hist.textContent =
          all.length +
          " insight(s) evaluated for range " +
          (data.range ? data.range.start + " → " + data.range.end : "") +
          ". Amounts in ₹.";
      }

      if (!all.length) {
        root.innerHTML =
          '<div class="lg:col-span-12 text-center py-12 text-on-surface-variant">No transaction data yet. Add entries under Transactions.</div>';
        return;
      }

      var html = "";
      all.slice(0, 3).forEach(function (a, i) {
        var span = i === 0 ? "lg:col-span-8" : "lg:col-span-6";
        html +=
          '<div class="' +
          span +
          '">' +
          '<div class="bg-surface-container-lowest rounded-xl p-8 editorial-shadow border-l-4 ' +
          cardClass(a.severity) +
          ' h-full flex flex-col">' +
          '<div class="flex items-center justify-between mb-6">' +
          '<span class="' +
          badgeClass(a.severity) +
          ' font-label text-[10px] uppercase tracking-widest px-3 py-1 rounded-sm font-bold">' +
          badgeLabel(a.severity) +
          "</span></div>" +
          '<h3 class="font-headline font-bold text-xl text-primary leading-tight mb-4">' +
          esc(a.title) +
          "</h3>" +
          '<p class="font-body text-sm text-on-surface-variant leading-relaxed mb-4">' +
          esc(a.explanation) +
          "</p>" +
          (a.insight ? '<div class="mt-2 mb-4 p-3 bg-primary-fixed/30 rounded-lg text-xs font-medium text-on-surface-variant leading-relaxed"><strong class="text-primary block mb-1">Smart Insight:</strong>' + esc(a.insight) + '</div>' : '') +
          '<p class="text-xs text-outline mt-auto pt-4 border-t border-outline-variant/10">' +
          (a.amount ? fmt(a.amount) + " · " : "") +
          esc(a.category || "") +
          " · " +
          esc(a.period_label || "") +
          "</p></div></div>";
      });

      root.innerHTML = html;

      // Populate AI Performance
      var pRoot = document.getElementById("ai-performance-root");
      if (pRoot && data.ai_performance) {
          var perf = data.ai_performance;
          pRoot.innerHTML =
              '<div class="flex justify-between border-b border-surface-variant pb-3"><span class="text-sm font-semibold text-primary">Records Analyzed</span><span class="text-sm text-on-surface-variant">' + perf.records_analyzed + '</span></div>' +
              '<div class="flex justify-between border-b border-surface-variant pb-3"><span class="text-sm font-semibold text-primary">Detection Coverage</span><span class="text-sm text-on-surface-variant">' + esc(perf.detection_coverage) + '</span></div>' +
              '<div class="flex justify-between border-b border-surface-variant pb-3"><span class="text-sm font-semibold text-primary">Confidence Score</span><span class="text-sm text-on-surface-variant">' + esc(perf.confidence_score) + '</span></div>' +
              '<div class="flex justify-between"><span class="text-sm font-semibold text-primary">Anomalies Active</span><span class="text-sm text-on-surface-variant">' + perf.total_anomalies + '</span></div>';
      }

      // Populate Detection History
      var hRoot = document.getElementById("detection-history-root");
      if (hRoot && data.detection_history && data.detection_history.length > 0) {
          var hHtml = "";
          data.detection_history.forEach(function (h) {
              hHtml += '<tr>' +
                  '<td class="py-3 px-4 whitespace-nowrap">' + esc(h.date) + '</td>' +
                  '<td class="py-3 px-4 font-semibold">' + esc(h.type) + '</td>' +
                  '<td class="py-3 px-4 w-1"><span class="' + badgeClass(h.severity) + ' px-2 py-0.5 rounded text-xs whitespace-nowrap">' + badgeLabel(h.severity) + '</span></td>' +
                  '<td class="py-3 px-4 w-1"><span class="text-secondary font-medium whitespace-nowrap flex items-center gap-1"><span class="material-symbols-outlined text-[16px]" style="font-size:16px;" data-icon="check_circle">check_circle</span>' + esc(h.status) + '</span></td>' +
                  '</tr>';
          });
          hRoot.innerHTML = hHtml;
      } else if (hRoot) {
          hRoot.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-outline">No historical anomalies found.</td></tr>';
      }

      // Render Graph
      if (data.resolution_trends && window.Chart && document.getElementById("resolutionTrendsChart")) {
          var ctx = document.getElementById("resolutionTrendsChart").getContext("2d");
          var labels = data.resolution_trends.map(function(t) { return t.month; });
          var detected = data.resolution_trends.map(function(t) { return t.detected; });
          var resolved = data.resolution_trends.map(function(t) { return t.resolved; });

          new Chart(ctx, {
              type: 'bar',
              data: {
                  labels: labels,
                  datasets: [
                      {
                          label: 'Detected',
                          data: detected,
                          backgroundColor: '#ffdfa0',
                          borderRadius: 4
                      },
                      {
                          label: 'Resolved',
                          data: resolved,
                          backgroundColor: '#9af6b8',
                          borderRadius: 4
                      }
                  ]
              },
              options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
                  plugins: { legend: { position: 'bottom' } }
              }
          });
      }
    } catch (e) {
      console.error(e);
      root.innerHTML =
        '<div class="lg:col-span-12 text-error text-sm p-6">Could not load anomalies. Check API and sign-in.</div>';
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
