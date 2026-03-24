/**
 * Data Entry & Import — ledger table, manual submit, CSV/XLSX import.
 * Requires config.js + auth.js (FinSightAuth) loaded first.
 */
(function () {
  var ENDPOINT =
    String(window.FINSIGHT_API_ORIGIN || "http://127.0.0.1:8000").replace(/\/$/, "") +
    "/api/transactions/";

  function apiHeaders() {
    return Object.assign(
      { "Content-Type": "application/json", Accept: "application/json" },
      window.FinSightAuth.authHeader()
    );
  }

  function unwrapList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.results)) return data.results;
    return [];
  }

  function parseCSVLine(line) {
    var result = [];
    var cur = "";
    var q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        q = !q;
        continue;
      }
      if (!q && c === ",") {
        result.push(cur.trim());
        cur = "";
        continue;
      }
      cur += c;
    }
    result.push(cur.trim());
    return result;
  }

  function parseCSVText(text) {
    var lines = text.split(/\r?\n/).filter(function (l) {
      return l.trim().length;
    });
    if (lines.length < 2) return [];
    var headers = parseCSVLine(lines[0]).map(function (h) {
      return h.trim();
    });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var cells = parseCSVLine(lines[i]);
      if (cells.length === 1 && !cells[0]) continue;
      var row = {};
      for (var j = 0; j < headers.length; j++) {
        row[headers[j]] = cells[j] !== undefined ? cells[j] : "";
      }
      rows.push(row);
    }
    return rows;
  }

  function pick(obj) {
    var keys = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
    }
    return undefined;
  }

  function normalizeType(t) {
    var s = String(t || "Revenue").trim();
    var lower = s.toLowerCase();
    /* Bank/ledger CSV exports often use Credit (inflow) / Debit (outflow) */
    if (lower === "credit" || lower === "cr") return "Revenue";
    if (lower === "debit" || lower === "dr") return "Expense";
    if (lower === "revenue" || lower === "income") return "Revenue";
    if (lower === "expense" || lower === "cost") return "Expense";
    if (lower === "transfer") return "Transfer";
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function rowToPayload(r) {
    var amount = parseFloat(pick(r, "Amount", "amount", "AMOUNT"));
    if (isNaN(amount)) amount = 0;
    var typeStr = pick(r, "Type", "type", "Transaction Type", "transaction_type");
    var type = typeStr
      ? normalizeType(typeStr)
      : amount < 0
        ? "Expense"
        : "Revenue";
    if (type !== "Revenue" && type !== "Expense" && type !== "Transfer") {
      type = amount < 0 ? "Expense" : "Revenue";
    }
    if (type === "Expense" && amount > 0) amount = -Math.abs(amount);

    var dateRaw = pick(r, "Date", "date", "DATE");
    var dateStr;
    if (typeof dateRaw === "number") {
      var ms = Math.round((dateRaw - 25569) * 86400 * 1000);
      dateStr = new Date(ms).toISOString().split("T")[0];
    } else {
      dateStr = dateRaw ? String(dateRaw).trim() : new Date().toISOString().split("T")[0];
    }

    var entity =
      pick(r, "Entity Name", "Entity", "Name", "entity_name", "Payee", "Description") || "Unknown";

    return {
      date: dateStr,
      transaction_type: type,
      entity_name: String(entity).trim(),
      amount: amount,
      notes: String(pick(r, "Notes", "notes", "Memo", "memo") || "").trim(),
      category: String(pick(r, "Category", "category") || "Uncategorized").trim(),
      status: String(pick(r, "Status", "status") || "CLEARED").trim(),
    };
  }

  function downloadTemplate() {
    var csv =
      "Date,Type,Entity Name,Amount,Notes,Category,Status\n" +
      "2024-03-15,Revenue,Sample Customer,1500.00,Invoice #100,Sales Revenue,CLEARED\n" +
      "2024-03-16,Credit,Another Client,800.00,Credit inflow,Cash In,CLEARED\n" +
      "2024-03-17,Debit,Supplier Co,200.00,Debit outflow,Supplies,CLEARED\n";
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "transaction_import_template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function renderRows(tbody, transactions) {
    tbody.innerHTML = "";
    if (!transactions.length) {
      var tr = document.createElement("tr");
      tr.id = "ledger-empty-state";
      tr.innerHTML =
        '<td colspan="4" class="px-8 py-12 text-center text-on-surface-variant text-sm">No transactions yet. Add a record manually or import a CSV / Excel file.</td>';
      tbody.appendChild(tr);
      return;
    }

    transactions.forEach(function (t) {
      var tr = document.createElement("tr");
      tr.className = "hover:bg-surface-container-low/50 transition-colors group";

      var amountVal = parseFloat(t.amount);
      var isExpense = (t.transaction_type || "").toLowerCase() === "expense" || amountVal < 0;
      var amountClass = isExpense ? "text-primary" : "text-secondary";
      var icon = isExpense ? "arrow_outward" : "call_received";
      var iconColorClass = isExpense
        ? "text-error group-hover:bg-error-container/20"
        : "text-secondary group-hover:bg-secondary-container/20";
      var absAmt = Math.abs(amountVal);
      var formattedAmount = window.formatINR
        ? window.formatINR(absAmt)
        : "₹" + absAmt.toFixed(2);

      tr.innerHTML =
        '<td class="px-8 py-5">' +
        '<div class="flex items-center gap-4">' +
        '<div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center transition-colors ' +
        iconColorClass +
        '">' +
        '<span class="material-symbols-outlined">' +
        icon +
        "</span>" +
        "</div>" +
        "<div>" +
        '<div class="font-bold text-sm">' +
        escapeHtml(t.entity_name) +
        "</div>" +
        '<div class="text-[10px] text-outline font-medium">' +
        escapeHtml(t.transaction_type) +
        " • " +
        escapeHtml(String(t.date)) +
        "</div>" +
        "</div>" +
        "</div>" +
        "</td>" +
        '<td class="px-8 py-5">' +
        '<span class="inline-flex items-center gap-1 bg-surface-container text-on-surface-variant text-[10px] font-bold px-2 py-1 rounded-sm">' +
        escapeHtml((t.status || "CLEARED").toUpperCase()) +
        "</span>" +
        "</td>" +
        '<td class="px-8 py-5">' +
        '<div class="text-xs text-on-surface-variant">' +
        escapeHtml(t.category || "Uncategorized") +
        "</div>" +
        "</td>" +
        '<td class="px-8 py-5 text-right font-headline font-bold ' +
        amountClass +
        '">' +
        (isExpense ? "-" : "+") +
        formattedAmount +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  async function loadTransactions() {
    var tbody = document.getElementById("transactions-list");
    if (!tbody) return;
    try {
      var res = await fetch(ENDPOINT, { headers: apiHeaders(), credentials: "omit" });
      if (res.status === 401) {
        tbody.innerHTML =
          '<tr><td colspan="4" class="px-8 py-8 text-center text-error text-sm">Session expired. Please sign in again.</td></tr>';
        return;
      }
      if (!res.ok) throw new Error("Failed to load transactions");
      var data = await res.json();
      var list = unwrapList(data);
      list.sort(function (a, b) {
        var ca = new Date(a.created_at || a.date).getTime();
        var cb = new Date(b.created_at || b.date).getTime();
        return cb - ca;
      });
      renderRows(tbody, list);
    } catch (e) {
      console.error(e);
      tbody.innerHTML =
        '<tr><td colspan="4" class="px-8 py-8 text-center text-error text-sm">Could not load transactions. Is the API running?</td></tr>';
    }
  }

  function wireManualForm() {
    var form = document.getElementById("manual-transaction-form");
    if (!form) return;
    var errEl = document.getElementById("manual-form-error");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (errEl) {
        errEl.classList.add("hidden");
        errEl.textContent = "";
      }

      var date = document.getElementById("t-date").value;
      var transaction_type = document.getElementById("t-type").value;
      var entity_name = (document.getElementById("t-entity").value || "").trim();
      var amountRaw = document.getElementById("t-amount").value;
      var notes = (document.getElementById("t-notes").value || "").trim();

      if (!date) {
        if (errEl) {
          errEl.textContent = "Please select a date.";
          errEl.classList.remove("hidden");
        }
        return;
      }
      if (!entity_name) {
        if (errEl) {
          errEl.textContent = "Please enter an entity name.";
          errEl.classList.remove("hidden");
        }
        return;
      }
      var amount = parseFloat(amountRaw);
      if (isNaN(amount) || amount === 0) {
        if (errEl) {
          errEl.textContent = "Please enter a valid non-zero amount.";
          errEl.classList.remove("hidden");
        }
        return;
      }

      if (transaction_type.toLowerCase() === "expense" && amount > 0) {
        amount = -Math.abs(amount);
      }

      var payload = {
        date: date,
        transaction_type: transaction_type,
        entity_name: entity_name,
        amount: amount,
        notes: notes,
        status: "CLEARED",
        category: "Uncategorized",
      };

      var btn = document.getElementById("t-submit");
      try {
        if (btn) {
          btn.disabled = true;
          btn.innerHTML =
            '<span class="material-symbols-outlined text-lg animate-pulse">hourglass_empty</span> Saving…';
        }
        var res = await fetch(ENDPOINT, {
          method: "POST",
          headers: apiHeaders(),
          credentials: "omit",
          body: JSON.stringify(payload),
        });
        var body = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          var msg =
            body.detail ||
            (body.non_field_errors && body.non_field_errors[0]) ||
            JSON.stringify(body);
          throw new Error(typeof msg === "string" ? msg : "Save failed");
        }
        form.reset();
        await loadTransactions();
      } catch (x) {
        if (errEl) {
          errEl.textContent = x.message || "Failed to save transaction.";
          errEl.classList.remove("hidden");
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML =
            '<span class="material-symbols-outlined text-lg" data-icon="save">save</span> Commit to Ledger';
        }
      }
    });
  }

  function wireBulkImport() {
    var input = document.getElementById("bulk-file-input");
    if (!input) return;
    input.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      var name = file.name.toLowerCase();

      if (name.endsWith(".csv")) {
        var r = new FileReader();
        r.onload = function (ev) {
          try {
            var text = String(ev.target.result || "");
            var rawRows = parseCSVText(text);
            if (!rawRows.length) {
              alert("CSV has no data rows.");
              return;
            }
            var payload = rawRows.map(rowToPayload);
            postBulk(payload);
          } catch (err) {
            console.error(err);
            alert("Could not parse CSV file.");
          }
        };
        r.readAsText(file, "UTF-8");
        return;
      }

      if (!window.XLSX) {
        alert("Excel support library not loaded.");
        return;
      }
      var reader = new FileReader();
      reader.onload = function (event) {
        try {
          var workbook = XLSX.read(event.target.result, { type: "binary" });
          var firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(firstSheet);
          if (!rows.length) {
            alert("Spreadsheet is empty.");
            return;
          }
          var payload = rows.map(rowToPayload);
          postBulk(payload);
        } catch (err) {
          console.error(err);
          alert("Could not read spreadsheet.");
        }
      };
      reader.readAsBinaryString(file);
    });
  }

  async function postBulk(payload) {
    if (!window.FinSightAuth.getToken()) {
      alert("You must be signed in to import.");
      return;
    }
    try {
      var res = await fetch(ENDPOINT + "bulk_import/", {
        method: "POST",
        headers: apiHeaders(),
        credentials: "omit",
        body: JSON.stringify(payload),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.status === 401) {
        alert("Session expired. Please sign in again.");
        return;
      }
      if (!res.ok && !data.created_count) {
        alert("Import failed: " + (data.detail || JSON.stringify(data.errors || data)));
        return;
      }
      var msg = data.message || "Import complete.";
      if (data.error_count) {
        msg +=
          "\n\nSkipped rows:\n" +
          (data.errors || [])
            .slice(0, 5)
            .map(function (x) {
              return "Row " + x.row + ": " + JSON.stringify(x.errors);
            })
            .join("\n");
        if ((data.errors || []).length > 5) msg += "\n…";
      }
      alert(msg);
      await loadTransactions();
    } catch (err) {
      console.error(err);
      alert("Import request failed.");
    }
  }

  function wireTemplateButton() {
    var btn = document.getElementById("download-csv-template");
    if (btn) btn.addEventListener("click", function (e) {
      e.preventDefault();
      downloadTemplate();
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var err = document.getElementById("manual-form-error");
    if (err && !err.classList.contains("hidden")) err.classList.add("hidden");
    wireManualForm();
    wireBulkImport();
    wireTemplateButton();
    loadTransactions();
  });
})();
