(function () {
  var DASHBOARD = "../main_health_dashboard/code.html";

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("signup-form");
    var err = document.getElementById("signup-error");
    var btn = document.getElementById("signup-submit");
    if (!form) return;

    function showError(msg) {
      if (!err) return;
      err.textContent = msg;
      err.classList.remove("hidden");
    }

    function hideError() {
      if (!err) return;
      err.classList.add("hidden");
      err.textContent = "";
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      hideError();

      var username = (document.getElementById("username") && document.getElementById("username").value) || "";
      var email = (document.getElementById("email") && document.getElementById("email").value) || "";
      var p1 = (document.getElementById("password") && document.getElementById("password").value) || "";
      var p2 =
        (document.getElementById("password_confirm") && document.getElementById("password_confirm").value) || "";

      if (!username.trim()) {
        showError("Please choose a username.");
        return;
      }
      if (!email.trim()) {
        showError("Please enter your email.");
        return;
      }
      if (!p1) {
        showError("Please enter a password (min. 8 characters).");
        return;
      }
      if (p1 !== p2) {
        showError("Passwords do not match.");
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
      }
      try {
        await window.FinSightAuth.signup({
          username: username.trim(),
          email: email.trim(),
          password: p1,
          password_confirm: p2,
        });
        window.location.href = DASHBOARD;
      } catch (x) {
        showError(x.message || "Registration failed.");
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
        }
      }
    });
  });
})();
