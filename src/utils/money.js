/**
 * money.js - Money helpers.
 *
 * DESIGN DECISION: every amount is stored and calculated as an INTEGER number of paise
 * (1 rupee = 100 paise). Integers never suffer from floating-point errors such as
 * 0.1 + 0.2 = 0.30000000000000004, so bills always add up exactly. We only convert
 * to rupees when displaying.
 */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paise) => Number(paise) / 100;

/** Formats paise as Indian currency, e.g. 123450 -> "₹1,234.50" */
export function formatINR(paise) {
  const rupees = Number(paise || 0) / 100;
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Percentage of an amount in paise, rounded half-up to the nearest paisa.
 * Integer maths keeps the result exact: (amount * percent) / 100.
 */
export function percentOf(paise, percent) {
  return Math.round((paise * percent) / 100);
}
