/**
 * Token auth against Django REST + authtoken. Passwords are never stored in the browser.
 */
(function () {
  var TOKEN_KEY = "finsight_auth_token";

  function origin() {
    var o = window.FINSIGHT_API_ORIGIN;
    if (typeof o !== "string" || !o) {
      o = "http://127.0.0.1:8000";
    }
    return String(o).replace(/\/$/, "");
  }

  function authHeader() {
    var t = localStorage.getItem(TOKEN_KEY);
    if (!t) return {};
    return { Authorization: "Token " + t };
  }

  function setToken(key) {
    if (key) localStorage.setItem(TOKEN_KEY, key);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function fetchMe() {
    var r = await fetch(origin() + "/api/auth/me/", {
      credentials: "omit",
      headers: Object.assign({ Accept: "application/json" }, authHeader()),
    });
    if (!r.ok) throw new Error("unauthorized");
    return r.json();
  }

  async function login(email, password) {
    var r = await fetch(origin() + "/api/auth/login/", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email.trim(), password: password }),
    });
    var data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      var msg =
        data.detail ||
        (data.non_field_errors && data.non_field_errors[0]) ||
        (data.email && data.email[0]) ||
        (data.password && data.password[0]) ||
        "Login failed.";
      throw new Error(msg);
    }
    if (data.token) setToken(data.token);
    return data;
  }

  function firstApiError(data) {
    if (!data || typeof data !== "object") return "Request failed.";
    if (data.detail) {
      return typeof data.detail === "string" ? data.detail : "Request failed.";
    }
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      var v = data[keys[i]];
      if (Array.isArray(v) && v.length) return String(v[0]);
      if (typeof v === "string") return v;
    }
    return "Registration failed.";
  }

  async function signup(payload) {
    var r = await fetch(origin() + "/api/auth/signup/", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    var data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) {
      throw new Error(firstApiError(data));
    }
    if (data.token) setToken(data.token);
    return data;
  }

  async function logout() {
    var t = getToken();
    if (t) {
      try {
        await fetch(origin() + "/api/auth/logout/", {
          method: "POST",
          credentials: "omit",
          headers: Object.assign(
            { "Content-Type": "application/json", Accept: "application/json" },
            authHeader()
          ),
        });
      } catch (e) {
        /* network errors: still clear local token */
      }
    }
    setToken(null);
  }

  window.FinSightAuth = {
    TOKEN_KEY: TOKEN_KEY,
    origin: origin,
    authHeader: authHeader,
    getToken: getToken,
    setToken: setToken,
    fetchMe: fetchMe,
    login: login,
    signup: signup,
    logout: logout,
  };
})();
