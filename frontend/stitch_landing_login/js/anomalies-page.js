/**
 * Anomalies page — same analytics API, highlights expense / pattern signals from real transactions.
 */
(function () {
  var API_BASE = String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8001").replace(/\/$/, "");
  var URL = API_BASE + "/api/transactions/analytics/?range=last_6_months";

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

    try {
      var res = await fetch(URL, { headers: headers(), credentials: "omit" });
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
          '<p class="text-xs text-outline mt-auto pt-4 border-t border-outline-variant/10">' +
          (a.amount ? fmt(a.amount) + " · " : "") +
          esc(a.category || "") +
          " · " +
          esc(a.period_label || "") +
          "</p></div></div>";
      });

      root.innerHTML = html;
    } catch (e) {
      console.error(e);
      root.innerHTML =
        '<div class="lg:col-span-12 text-error text-sm p-6">Could not load anomalies. Check API and sign-in.</div>';
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();
