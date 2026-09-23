const { kv } = require('@vercel/kv');

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const { PREMIUM_THEMES, entitlements } = require('../../lib/premium');

module.exports = async (req, res) => {
  const { id } = req.query;
  const invite = await kv.get(id);

  if (!invite) {
    res.status(404).send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invite not found</title><link rel="stylesheet" href="/styles.css?v=6"></head><body><div class="card viewer"><div class="check">💔</div><h2>This invite isn't here</h2><p class="muted">It may have expired or the link is incomplete.</p><a class="btn-make-own" href="/">Make your own invite 💌</a></div></body></html>`);
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
  const premium = entitlements(invite.premium);
  if (PREMIUM_THEMES.includes(inviteForClient.th) && !premium.theme) inviteForClient.th = 'default';
  inviteForClient.premium = premium;
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
  <meta name="robots" content="noindex">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💌</text></svg>">
  <link rel="stylesheet" href="/styles.css?v=6">
</head>
<body class="viewer-page">
<div id="viewer" class="card viewer" hidden>
  <div class="photo-wrap" id="g-photo-wrap"><img id="g-photo" class="girl-photo" alt=""></div>
  <div class="ask" id="g-ask"></div>
  <div class="details" id="g-details">
    <div class="detail" id="g-when-row"><span class="detail-icon">📅</span><span class="detail-text"><span class="detail-label">When</span><span id="g-when"></span></span></div>
    <div class="detail" id="g-where-row"><span class="detail-icon">📍</span><span class="detail-text"><span class="detail-label">Where</span><span id="g-where"></span></span></div>
  </div>
  <p class="note" id="g-message" hidden></p>
  <div class="answer-buttons" id="answer-buttons">
    <button class="btn-yes" id="btn-yes">Yes! 💖</button>
    <button class="btn-no" id="btn-no">No</button>
  </div>
  <div class="confirmation" id="confirmation">
    <div class="check">💖</div>
    <h2 id="conf-title">Yay! It's a date!</h2>
    <p id="conf-text"></p>
    <div class="countdown" id="countdown" hidden>
      <div class="countdown-label">Counting down</div>
      <div class="countdown-grid">
        <div><b id="cd-d">0</b><span>days</span></div>
        <div><b id="cd-h">0</b><span>hours</span></div>
        <div><b id="cd-m">0</b><span>min</span></div>
        <div><b id="cd-s">0</b><span>sec</span></div>
      </div>
    </div>
    <div class="conf-actions">
      <button type="button" class="btn-secondary" id="btn-calendar" hidden>Add to calendar</button>
    </div>
    <div class="map-container" id="map-container" hidden></div>
    <div class="stats-card" id="stats-card" hidden>
      <div class="stats-title">Reaction stats</div>
      <div class="stats-grid">
        <div><div class="stat-num" id="stat-time"></div><div class="stat-label">to say yes</div></div>
        <div><div class="stat-num" id="stat-chases"></div><div class="stat-label">"No" escapes</div></div>
      </div>
      <div class="stats-verdict" id="stat-verdict"></div>
      <button type="button" class="stats-share" id="stats-share">Share</button>
    </div>
    <a class="btn-make-own brand" href="/">Make your own invite 💌</a>
  </div>
  <a class="make-own brand" href="/">Sent with 💌 via ask-her-out.com</a>
</div>
<script>window.__INVITE__ = ${safeJson}; window.__MAPS_KEY__ = "${escHtml(MAPS_KEY)}";</script>
<script src="/app.js?v=8"></script>
</body>
</html>`);
};
