/**
 * Indian Rupee display (amounts in DB stay numeric; no conversion).
 */
(function () {
  window.formatINR = function (n) {
    if (n === null || n === undefined || (typeof n === "number" && isNaN(n))) n = 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(Number(n));
  };
})();
