// Shared premium catalog. Prices are in cents; Stripe line items are built
// from this map so the client can never set its own price.
const PREMIUM_THEMES = ['petals', 'letter', 'starry'];

const PRICES = {
  theme: { amount: 200, name: 'Animated theme' },
  stats: { amount: 300, name: 'Reaction stats card' },
  pass:  { amount: 400, name: 'Premium Pass (theme, stats, countdown, no branding)' },
};

const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true';

// Resolves stored entitlements into concrete feature flags. The Pass grants everything.
function entitlements(p = {}) {
  const pass = !!p.pass;
  return { theme: pass || !!p.theme, stats: pass || !!p.stats, pass };
}

// Normalizes a purchase request: the Pass supersedes single items.
function normalizeItems(items) {
  const wanted = [...new Set(items)].filter(k => PRICES[k]);
  return wanted.includes('pass') ? ['pass'] : wanted;
}

module.exports = { PREMIUM_THEMES, PRICES, paymentsEnabled, entitlements, normalizeItems };
