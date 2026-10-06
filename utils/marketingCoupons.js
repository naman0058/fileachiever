/**
 * Site-wide marketing / exit-offer coupon codes (server source of truth).
 * Checkout and GET /api/coupon/validate must use resolveMarketingCoupon() — never trust client discount %.
 *
 * Optional env: MARKETING_COUPON_FM10_PERCENT (default 10)
 */

function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase();
}

function marketingCatalog() {
  const fm10Pct = Number(process.env.MARKETING_COUPON_FM10_PERCENT);
  const discountPercent = Number.isFinite(fm10Pct) && fm10Pct > 0 ? fm10Pct : 10;
  return {
    FM10: {
      code: 'FM10',
      discountPercent,
      label: 'Flat 10% Extra Off',
    },
  };
}

/**
 * @returns {{ code: string, discountPercent: number, label: string } | null}
 */
function resolveMarketingCoupon(code) {
  const key = normalizeCouponCode(code);
  if (!key) return null;
  const entry = marketingCatalog()[key];
  if (!entry || !(Number(entry.discountPercent) > 0)) return null;
  return {
    code: entry.code,
    discountPercent: Number(entry.discountPercent),
    label: entry.label,
  };
}

module.exports = {
  normalizeCouponCode,
  resolveMarketingCoupon,
};
