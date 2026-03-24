/**
 * Blocks rendering until /api/auth/me/ succeeds. Redirects to login if missing/invalid token.
 * Include after config.js + auth.js, immediately after <body>.
 */
(function () {
  var LOGIN = "../landing_login/code.html";

  function redirectToLogin() {
    var next = encodeURIComponent(location.pathname + location.search + location.hash);
    window.location.replace(LOGIN + "?next=" + next);
  }

  var token = window.FinSightAuth.getToken();
  if (!token) {
    redirectToLogin();
    return;
  }

  var st = document.createElement("style");
  st.textContent = "html.finsight-auth-pending body { visibility: hidden !important; }";
  document.head.appendChild(st);
  document.documentElement.classList.add("finsight-auth-pending");

  window.FinSightAuth.fetchMe()
    .then(function () {
      document.documentElement.classList.remove("finsight-auth-pending");
    })
    .catch(function () {
      window.FinSightAuth.setToken(null);
      redirectToLogin();
    });
})();
