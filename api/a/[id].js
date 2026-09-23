const { kv } = require('@vercel/kv');

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const { PREMIUM_THEMES } = require('../../lib/premium');

module.exports = async (req, res) => {
  const { id } = req.query;
  const invite = await kv.get(id);

  if (!invite) {
    res.status(404).send('<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invite not found or expired 💔</h2></body></html>');
    return;
  }

  const askPhrase = invite.a || 'wanna go on a date?';
  const title = escHtml(`${invite.n}, ${askPhrase}`);
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];
  const photo = invite.photoData ? `${proto}://${host}/api/photo/${id}` : '';
  // strip sensitive fields from inline JSON; pass photo URL and id instead
  const { photoData: _, email: __, result: ___, ...inviteForClient } = invite;
  inviteForClient.id = id;
  // Premium features are only honored once the Stripe webhook has marked them paid
  const premium = invite.premium || {};
  if (PREMIUM_THEMES.includes(inviteForClient.th) && !premium.theme) inviteForClient.th = 'default';
  inviteForClient.premium = { theme: !!premium.theme, stats: !!premium.stats };
  if (photo) inviteForClient.photoUrl = photo;
  const safeJson = JSON.stringify(inviteForClient).replace(/<\/script>/gi, '<\\/script>');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="You've got a special invite 💌 Open to find out...">
  <meta property="og:type" content="website">
  ${photo ? `<meta property="og:image" content="${escHtml(photo)}">` : ''}
  <link rel="stylesheet" href="/styles.css?v=4">
</head>
<body>
<div id="viewer" class="card" hidden>
  <img id="g-photo" class="girl-photo" alt="">
  <div class="ask" id="g-ask"></div>
  <div class="details">
    <div class="row"><span class="label">When</span><span id="g-when"></span></div>
    <div class="row"><span class="label">Where</span><span id="g-where"></span></div>
  </div>
  <p class="note" id="g-message" hidden></p>
  <div class="answer-buttons" id="answer-buttons">
    <button class="btn-yes" id="btn-yes">Yes! 💖</button>
    <button class="btn-no" id="btn-no">No</button>
  </div>
  <div class="confirmation" id="confirmation">
    <div class="check">💖</div>
    <h2>Yay! It's a date!</h2>
    <p id="conf-text"></p>
    <div class="map-container" id="map-container" hidden></div>
    <div class="stats-card" id="stats-card" hidden>
      <div class="stats-title">Reaction stats 📊</div>
      <div class="stats-grid">
        <div><div class="stat-num" id="stat-time"></div><div class="stat-label">to say yes</div></div>
        <div><div class="stat-num" id="stat-chases"></div><div class="stat-label">"No" escapes</div></div>
      </div>
      <div class="stats-verdict" id="stat-verdict"></div>
      <button type="button" class="copy-btn" id="stats-share">Share 📤</button>
    </div>
    <a class="btn-make-own" href="/">Make your own invite 💌</a>
  </div>
  <a class="make-own" href="/">Make your own 💌</a>
</div>
<script>window.__INVITE__ = ${safeJson}; window.__MAPS_KEY__ = "${escHtml(MAPS_KEY)}";</script>
<script src="/app.js?v=7"></script>
</body>
</html>`);
};
