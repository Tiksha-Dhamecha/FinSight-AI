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
  window.FINSIGHT_API_ORIGIN = String(window.FINSIGHT_API_ORIGIN).replace(/\/$/, "");
})();
