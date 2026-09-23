const { kv } = require('@vercel/kv');
const { PRICES, PREMIUM_THEMES, paymentsEnabled } = require('../lib/premium');

// Creates a one-time Stripe Checkout Session for an existing invite.
// Uses Stripe's REST API directly (form-encoded), so no SDK dependency.
module.exports = async (req, res) => {
  if (!paymentsEnabled()) return res.status(404).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: 'Payments not configured' });

  const { id, items } = req.body || {};
  if (!id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing id or items' });
  }
  const wanted = [...new Set(items)].filter(k => PRICES[k]);
  if (wanted.length === 0) return res.status(400).json({ error: 'No purchasable items' });

  const invite = await kv.get(id);
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (wanted.includes('theme') && !PREMIUM_THEMES.includes(invite.th)) {
    return res.status(400).json({ error: 'Invite does not use a premium theme' });
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${req.headers['host']}`;

  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${origin}/?paid=${id}`);
  form.set('cancel_url', `${origin}/?canceled=${id}`);
  form.set('metadata[invite_id]', id);
  form.set('metadata[items]', wanted.join(','));
  wanted.forEach((k, i) => {
    form.set(`line_items[${i}][quantity]`, '1');
    form.set(`line_items[${i}][price_data][currency]`, 'usd');
    form.set(`line_items[${i}][price_data][unit_amount]`, String(PRICES[k].amount));
    form.set(`line_items[${i}][price_data][product_data][name]`, PRICES[k].name);
  });

  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const session = await r.json();
  if (!r.ok || !session.url) {
    console.error('stripe checkout error', session.error?.message);
    return res.status(502).json({ error: 'Could not start checkout' });
  }
  return res.status(200).json({ url: session.url });
};
