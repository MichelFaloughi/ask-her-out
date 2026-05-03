const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  const { id } = req.query;
  const invite = await kv.get(id);

  if (!invite || !invite.photoData) {
    return res.status(404).end();
  }

  const match = invite.photoData.match(/^data:([a-z/]+);base64,(.+)$/);
  if (!match) return res.status(404).end();

  const [, mimeType, b64] = match;
  const buffer = Buffer.from(b64, 'base64');

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.end(buffer);
};
