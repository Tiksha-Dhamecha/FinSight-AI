/**
 * API origin for the Django backend (no trailing slash).
 * Override before other scripts load, e.g.:
 *   <script>window.FINSIGHT_API_ORIGIN = "http://127.0.0.1:8001";</script>
 */
(function () {
  if (typeof window.FINSIGHT_API_ORIGIN !== "string" || !window.FINSIGHT_API_ORIGIN) {
    /* Default 8001: port 8000 is often blocked on Windows; change if your Django uses another port */
    window.FINSIGHT_API_ORIGIN = "http://127.0.0.1:8001";
  }
  window.FINSIGHT_API_ORIGIN = String(window.FINSIGHT_API_ORIGIN).replace(/\/$/, "");
})();
