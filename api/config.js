const { PRICES, paymentsEnabled } = require('../lib/premium');

// Public, non-secret runtime config for the creator page.
module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    paymentsEnabled: paymentsEnabled(),
    prices: Object.fromEntries(Object.entries(PRICES).map(([k, v]) => [k, v.amount])),
  });
};
