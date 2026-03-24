/**
 * API origin for the Django backend (no trailing slash).
 * Override before other scripts load, e.g.:
 *   <script>window.FINSIGHT_API_ORIGIN = "http://127.0.0.1:8000";</script>
 */
(function () {
  if (typeof window.FINSIGHT_API_ORIGIN !== "string" || !window.FINSIGHT_API_ORIGIN) {
    /* Default 8000: default Django port */
    window.FINSIGHT_API_ORIGIN = "http://127.0.0.1:8000";
  }
  var s = String(window.FINSIGHT_API_ORIGIN).replace(/\/$/, "");
  /* Windows often resolves "localhost" to ::1 while runserver listens on 127.0.0.1 → connection refused */
  s = s.replace(/^http:\/\/localhost(?=:|\/|$)/i, "http://127.0.0.1");
  s = s.replace(/^https:\/\/localhost(?=:|\/|$)/i, "https://127.0.0.1");
  window.FINSIGHT_API_ORIGIN = s;
})();
