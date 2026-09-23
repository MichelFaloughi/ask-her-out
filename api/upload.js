const { kv } = require('@vercel/kv');
const { nanoid } = require('nanoid');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invite, imageDataUrl } = req.body;

  if (!invite || !invite.n) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (imageDataUrl && imageDataUrl.length > 800_000) {
    return res.status(413).json({ error: 'Image too large' });
  }

  const id = nanoid(8);
  // Cap field lengths so a stored invite stays small and the page stays sane
  const LIMITS = { n: 60, a: 80, m: 300, y: 60, p: 200, d: 10, t: 5, email: 254, th: 20 };
  for (const [k, max] of Object.entries(LIMITS)) {
    if (typeof invite[k] === 'string' && invite[k].length > max) invite[k] = invite[k].slice(0, max);
  }

  const stored = { ...invite };
  // Entitlements and results are only ever written server-side
  delete stored.premium;
  delete stored.result;
  if (imageDataUrl) stored.photoData = imageDataUrl;

  await kv.set(id, stored, { ex: 60 * 60 * 24 * 365 });

  return res.status(200).json({ id });
};
