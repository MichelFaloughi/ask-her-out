const { kv } = require('@vercel/kv');

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  const { id } = req.query;
  const invite = await kv.get(id);

  if (!invite) {
    res.status(404).send('<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Invite not found or expired 💔</h2></body></html>');
    return;
  }

  const askPhrase = invite.a || 'will you go out with me?';
  const title = escHtml(`${invite.n}, ${askPhrase}`);
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['host'];
  const photo = invite.photoData ? `${proto}://${host}/api/photo/${id}` : '';
  // strip raw photoData from inline JSON, pass a URL instead
  const { photoData: _, ...inviteForClient } = invite;
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
  <link rel="stylesheet" href="/styles.css?v=3">
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
  </div>
</div>
<script>window.__INVITE__ = ${safeJson};</script>
<script src="/app.js?v=4"></script>
</body>
</html>`);
};
