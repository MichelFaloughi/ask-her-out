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
  const stored = { ...invite };
  if (imageDataUrl) stored.photoData = imageDataUrl;

  await kv.set(id, stored, { ex: 60 * 60 * 24 * 365 });

  return res.status(200).json({ id });
};
