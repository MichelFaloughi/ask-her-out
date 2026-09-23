// Shared premium catalog. Prices are in cents; Stripe line items are built
// from this map so the client can never set its own price.
const PREMIUM_THEMES = ['petals', 'letter', 'starry'];

const PRICES = {
  theme: { amount: 200, name: 'Premium animated theme' },
  stats: { amount: 300, name: 'Reaction stats card' },
};

const paymentsEnabled = () => process.env.PAYMENTS_ENABLED === 'true';

module.exports = { PREMIUM_THEMES, PRICES, paymentsEnabled };
