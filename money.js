const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  numberingSystem: "latn",
  maximumFractionDigits: 0
});

/**
 * Format a whole-rupee amount with Indian grouping and Latin digits.
 * @param {number} amount Whole rupees to format.
 * @returns {string} Localized INR display string.
 */
export function formatMoney(amount) {
  return inrFormatter.format(amount);
}
