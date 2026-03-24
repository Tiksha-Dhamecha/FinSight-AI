(function () {
  var DASHBOARD = "../main_health_dashboard/code.html";

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function hideError(el) {
    if (!el) return;
    el.classList.add("hidden");
    el.textContent = "";
  }

  async function redirectIfAlreadyAuthed() {
    var t = window.FinSightAuth.getToken();
    if (!t) return;
    try {
      await window.FinSightAuth.fetchMe();
      var next = qs("next");
      window.location.replace(next ? decodeURIComponent(next) : DASHBOARD);
    } catch (e) {
      window.FinSightAuth.setToken(null);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    redirectIfAlreadyAuthed();

    var form = document.getElementById("login-form");
    var err = document.getElementById("login-error");
    var btn = document.getElementById("login-submit");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideError(err);

      var emailEl = document.getElementById("email");
      var passEl = document.getElementById("password");
      var email = (emailEl && emailEl.value) || "";
      var password = (passEl && passEl.value) || "";

      if (!email.trim()) {
        showError(err, "Please enter your work email.");
        return;
      }
      if (!password) {
        showError(err, "Please enter your security key.");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
      }
      try {
        await window.FinSightAuth.login(email, password);
        var next = qs("next");
        window.location.href = next ? decodeURIComponent(next) : DASHBOARD;
      } catch (x) {
        showError(err, x.message || "Sign in failed.");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
        }
      }
    });
  });
})();
