// =============================================================
//  Ask Her Out — client: landing + creator + her page (viewer)
// =============================================================

// ---------- Floating background particles ----------
const PARTICLES = {
  hearts: { symbols: ['💗', '💖', '💕', '✨', '🌸', '🌷'], count: 26 },
  petals: { symbols: ['🌸', '🌸', '🌸', '🌺', '💮'],      count: 34, cls: 'petal' },
  stars:  { symbols: ['✦', '✧', '★', '✦', '·'],           count: 60, cls: 'star' },
};
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let currentParticles = null;
function spawnParticles(kind) {
  if (kind === currentParticles) return;
  currentParticles = kind;
  document.querySelectorAll('.heart').forEach(el => el.remove());
  if (REDUCED_MOTION) return;
  const cfg = PARTICLES[kind] || PARTICLES.hearts;
  for (let i = 0; i < cfg.count; i++) {
    const h = document.createElement('div');
    h.className = 'heart' + (cfg.cls ? ' ' + cfg.cls : '');
    h.textContent = cfg.symbols[Math.floor(Math.random() * cfg.symbols.length)];
    h.style.left = (Math.random() * 100) + 'vw';
    if (kind === 'stars') {
      h.style.top = (Math.random() * 100) + 'vh';
      h.style.fontSize = (6 + Math.random() * 14) + 'px';
      h.style.animationDuration = (1.5 + Math.random() * 3) + 's';
      h.style.animationDelay = (-Math.random() * 4) + 's';
    } else {
      h.style.fontSize = (18 + Math.random() * 28) + 'px';
      h.style.animationDuration = (7 + Math.random() * 10) + 's';
      // Negative delay: particles are already mid-flight on load
      h.style.animationDelay = (-Math.random() * 14) + 's';
      h.style.setProperty('--drift', (40 + Math.random() * 80) * (Math.random() < 0.5 ? -1 : 1) + 'px');
    }
    document.body.appendChild(h);
  }
}
spawnParticles('hearts');

// ---------- UTF-8 safe base64 helpers (legacy hash links) ----------
function decodeData(str) {
  const b64 = decodeURIComponent(str);
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

// ---------- Constants ----------
const DEFAULT_ASK = 'wanna go on a date?';
const DEFAULT_YES = "Yay! It's a date!";

// ---------- Themes ----------
// Premium themes are only honored on server-rendered invites where the
// server has confirmed payment (see api/a/[id].js); the client just renders.
const THEMES = {
  default:  { particles: 'hearts' },
  ocean:    { particles: 'hearts' },
  sunset:   { particles: 'hearts' },
  mint:     { particles: 'hearts' },
  lavender: { particles: 'hearts' },
  petals:   { particles: 'petals', premium: true },
  letter:   { particles: 'hearts', premium: true },
  starry:   { particles: 'stars',  premium: true },
};
let currentTheme = 'default';
function applyTheme(t) {
  if (!THEMES[t]) t = 'default';
  currentTheme = t;
  document.body.dataset.theme = t;
  const phone = document.getElementById('phone');
  if (phone) phone.dataset.theme = t;
  spawnParticles(THEMES[t].particles);
}

// ---------- Payments feature flag (off unless the server says otherwise) ----------
let paymentsEnabled = false;
let PRICES = { theme: 200, stats: 300, pass: 400 };

// ---------- Shared creator state ----------
const $ = id => document.getElementById(id);
let compressedImage = null;
let selectedLat = null, selectedLng = null;
const PLACES_API = 'https://places.googleapis.com/v1';

// ---------- Mode switch ----------
if (typeof window.__INVITE__ !== 'undefined') {
  try { renderViewer(window.__INVITE__); }
  catch (e) { console.warn('Bad invite:', e); }
} else {
  const hash = location.hash.slice(1);
  if (hash) {
    try {
      const data = decodeData(hash);
      // Legacy hash links are client-authored, so never grant premium from them
      delete data.premium;
      if (THEMES[data.th]?.premium) data.th = 'default';
      renderViewer(data);
    } catch (e) {
      console.warn('Bad invite hash:', e);
      document.getElementById('creator').hidden = false;
    }
  } else {
    document.getElementById('creator').hidden = false;
    initCreator();
  }
}

// =============================================================
//  CREATOR
// =============================================================
function initCreator() {
  setupFileDrop();
  setupPlaceAutocomplete();
  setupCounters();
  setupThemePicker();
  setupLivePreview();
  setupExtras();
  setupSubmit();
  initPayments();
}

// ---------- Photo ----------
function setupFileDrop() {
  const dropZone = $('drop-zone');
  const fileInput = $('image');
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); }));
  dropZone.addEventListener('drop', e => { if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); });
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 560;
      let { width, height } = img;
      if (width > height && width > max) { height *= max / width;  width = max; }
      else if (height > max)              { width  *= max / height; height = max; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      compressedImage = canvas.toDataURL('image/jpeg', 0.75);
      if (compressedImage.length > 800_000) {
        $('drop-text').textContent = 'Image too large, please use a smaller one.';
        compressedImage = null;
        return;
      }
      $('preview').src = compressedImage;
      $('preview').classList.add('show');
      $('drop-text').textContent = 'Looking good ✓ Click to change';
      updatePreview();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ---------- Places autocomplete (custom UI on Places REST API) ----------
function setupPlaceAutocomplete() {
  const input = $('place');
  if (!input || !window.__MAPS_KEY__) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'place-wrapper';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const dropdown = document.createElement('div');
  dropdown.className = 'place-dropdown';
  dropdown.hidden = true;
  wrapper.appendChild(dropdown);

  let debounceTimer = null, abortCtrl = null;
  input.addEventListener('input', () => {
    selectedLat = null; selectedLng = null;
    const query = input.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);
    if (abortCtrl) abortCtrl.abort();
    if (!query) { dropdown.hidden = true; dropdown.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      abortCtrl = new AbortController();
      try {
        const res = await fetch(`${PLACES_API}/places:autocomplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': window.__MAPS_KEY__ },
          body: JSON.stringify({ input: query }),
          signal: abortCtrl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        renderSuggestions(data.suggestions || [], dropdown, input);
      } catch (e) { if (e.name !== 'AbortError') console.warn('autocomplete', e); }
    }, 250);
  });
  document.addEventListener('click', e => { if (!wrapper.contains(e.target)) dropdown.hidden = true; });
}

function renderSuggestions(suggestions, dropdown, input) {
  dropdown.innerHTML = '';
  const items = suggestions.map(s => s.placePrediction).filter(Boolean);
  if (items.length === 0) { dropdown.hidden = true; return; }
  for (const p of items) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'place-option';
    const main = document.createElement('div');
    main.className = 'place-option-main';
    main.textContent = p.structuredFormat?.mainText?.text || p.text?.text || '';
    item.appendChild(main);
    const secText = p.structuredFormat?.secondaryText?.text;
    if (secText) {
      const sec = document.createElement('div');
      sec.className = 'place-option-secondary';
      sec.textContent = secText;
      item.appendChild(sec);
    }
    item.addEventListener('click', () => selectPlace(p, dropdown, input));
    dropdown.appendChild(item);
  }
  dropdown.hidden = false;
}

async function selectPlace(prediction, dropdown, input) {
  input.value = prediction.structuredFormat?.mainText?.text || prediction.text?.text || '';
  dropdown.hidden = true;
  updatePreview();
  try {
    const res = await fetch(`${PLACES_API}/places/${prediction.placeId}`, {
      headers: { 'X-Goog-Api-Key': window.__MAPS_KEY__, 'X-Goog-FieldMask': 'location' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.location) { selectedLat = data.location.latitude; selectedLng = data.location.longitude; }
  } catch (e) { console.warn('place details', e); }
}

// ---------- Counters ----------
function setupCounters() {
  [['ask-phrase', 'ask-count'], ['message', 'msg-count'], ['yes-title', 'yes-count']].forEach(([inp, out]) => {
    const i = $(inp), o = $(out);
    if (i && o) i.addEventListener('input', () => { o.textContent = i.value.length; });
  });
}

// ---------- Theme picker ----------
function setupThemePicker() {
  const picker = $('theme-picker');
  picker.addEventListener('click', e => {
    const btn = e.target.closest('.theme-swatch');
    if (!btn) return;
    applyTheme(btn.dataset.theme);
    picker.querySelectorAll('.theme-swatch').forEach(b => b.classList.toggle('active', b === btn));
    // Picking an animated theme selects the matching extra (unless the Pass covers it)
    if (THEMES[currentTheme]?.premium && paymentsEnabled) {
      const pass = document.querySelector('.extra input[data-item="pass"]');
      const theme = document.querySelector('.extra input[data-item="theme"]');
      if (pass && theme && !pass.checked) theme.checked = true;
      updateExtras();
    }
  });
}

// ---------- Live preview ----------
function setupLivePreview() {
  ['name', 'date', 'time', 'place', 'message', 'ask-phrase'].forEach(id => $(id).addEventListener('input', updatePreview));
  updatePreview();
}

function updatePreview() {
  const name = $('name').value.trim() || 'Ana';
  const ask = $('ask-phrase').value.trim() || DEFAULT_ASK;
  renderAskText($('pv-ask'), `${name}, ${ask}`);

  const photoWrap = $('pv-photo-wrap');
  if (compressedImage) { $('pv-photo').src = compressedImage; photoWrap.hidden = false; } else photoWrap.hidden = true;

  const when = formatWhen($('date').value, $('time').value);
  const place = $('place').value.trim();
  $('pv-when').textContent = when; $('pv-when-row').hidden = !when;
  $('pv-where').textContent = place; $('pv-where-row').hidden = !place;
  $('pv-details').hidden = !when && !place;

  const msg = $('message').value.trim();
  $('pv-message').textContent = msg ? '“' + msg + '”' : '';
  $('pv-message').hidden = !msg;
}

// ---------- Premium extras ----------
function setupExtras() {
  document.querySelectorAll('.extra input').forEach(cb => cb.addEventListener('change', e => {
    const item = e.target.dataset.item;
    const pass = document.querySelector('.extra input[data-item="pass"]');
    if (item === 'pass' && pass.checked) {
      document.querySelectorAll('.extra input:not([data-item="pass"])').forEach(o => { o.checked = false; });
    } else if (item !== 'pass' && e.target.checked) {
      pass.checked = false;
    }
    updateExtras();
  }));
}

function selectedItems() {
  return [...document.querySelectorAll('.extra input:checked')].map(cb => cb.dataset.item);
}

function updateExtras() {
  const items = selectedItems();
  const total = items.includes('pass') ? PRICES.pass : items.reduce((sum, k) => sum + (PRICES[k] || 0), 0);
  $('extras-total').textContent = '$' + (total / 100).toFixed(total % 100 ? 2 : 0);
  const btn = $('submit-btn');
  btn.textContent = total > 0 ? `Create invite and pay $${(total / 100).toFixed(total % 100 ? 2 : 0)} 💌` : 'Create my invite 💌';
}

// Reveals premium options only when the server flag is on, and handles
// returning from Stripe Checkout (?paid=<id> or ?canceled=<id>).
async function initPayments() {
  const params = new URLSearchParams(location.search);
  const paidId = params.get('paid');
  const canceledId = params.get('canceled');
  if (paidId && /^[\w-]{6,12}$/.test(paidId)) {
    showLink(paidId, { note: 'Payment received ✓ Your premium extras are live on this link.' });
  } else if (canceledId && /^[\w-]{6,12}$/.test(canceledId)) {
    showLink(canceledId, { note: 'Checkout canceled. Your link still works with the free theme and no extras.' });
  }
  if (paidId || canceledId) history.replaceState(null, '', location.pathname);

  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    paymentsEnabled = !!cfg.paymentsEnabled;
    if (cfg.prices) PRICES = { ...PRICES, ...cfg.prices };
  } catch {}
  if (!paymentsEnabled) return;
  document.querySelectorAll('.theme-swatch.premium').forEach(b => { b.hidden = false; });
  document.querySelectorAll('[data-price]').forEach(el => { el.textContent = '$' + (PRICES[el.dataset.price] / 100).toFixed(0); });
  $('extras').hidden = false;
  $('nav-extras').hidden = false;
  $('trust-stripe').hidden = false;
  updateExtras();
}

// ---------- Submit ----------
function setupSubmit() {
  const form = $('creator-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('creator-error');
    err.textContent = '';

    const name  = $('name').value.trim();
    const email = $('creator-email').value.trim();
    const date  = $('date').value;
    const time  = $('time').value;
    const place = $('place').value.trim();
    const msg   = $('message').value.trim();
    const ask   = $('ask-phrase').value.trim();
    const yes   = $('yes-title').value.trim();

    if (!name) { err.textContent = 'Please add her name.'; $('name').focus(); return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'That email looks off.'; $('creator-email').focus(); return; }

    const items = paymentsEnabled ? selectedItems() : [];
    const theme = (THEMES[currentTheme]?.premium && !items.includes('theme') && !items.includes('pass')) ? 'default' : currentTheme;

    const submitBtn = $('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating your page…';

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite: {
            n: name, d: date, t: time, p: place, m: msg, th: theme,
            ...(ask && { a: ask }), ...(yes && { y: yes }), ...(email && { email }),
            ...(selectedLat != null && { plat: selectedLat, plng: selectedLng }),
          },
          imageDataUrl: compressedImage || null,
        }),
      });
      if (!res.ok) throw new Error('Server error ' + res.status);
      const { id } = await res.json();

      if (items.length) {
        submitBtn.textContent = 'Taking you to secure checkout…';
        const co = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, items }),
        });
        if (!co.ok) throw new Error('Checkout error ' + co.status);
        const { url } = await co.json();
        location.href = url;
        return;
      }
      showLink(id, { email });
    } catch {
      err.textContent = 'Something went wrong. Please try again.';
    } finally {
      submitBtn.disabled = false;
      updateExtras();
    }
  });

  $('copy-btn').addEventListener('click', async () => {
    const url = $('link-result').textContent;
    const btn = $('copy-btn');
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copied ✓';
      setTimeout(() => btn.textContent = 'Copy link', 1500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents($('link-result'));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      btn.textContent = 'Press ⌘C to copy';
    }
  });
}

function showLink(id, { note, email } = {}) {
  const url = location.origin + '/a/' + id;
  $('link-result').textContent = url;
  $('open-link').href = url;
  const text = `I made you something 💌 ${url}`;
  $('share-sms').href = 'sms:&body=' + encodeURIComponent(text);
  $('share-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  const noteEl = $('payment-note');
  noteEl.textContent = note || ''; noteEl.hidden = !note;
  const notify = $('notify-note');
  notify.textContent = email ? `We'll email ${email} the moment she says yes.` : '';
  notify.hidden = !email;
  const out = $('link-output');
  out.hidden = false;
  try { out.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
}

// =============================================================
//  VIEWER (her page)
// =============================================================

// Splits text into emoji and non-emoji spans so the gradient applies only to
// regular characters (emoji need a real color to render).
function renderAskText(el, text) {
  const emojiRe = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  el.innerHTML = '';
  let last = 0, match;
  while ((match = emojiRe.exec(text)) !== null) {
    if (match.index > last) {
      const s = document.createElement('span');
      s.className = 'ask-gradient';
      s.textContent = text.slice(last, match.index);
      el.appendChild(s);
    }
    el.appendChild(document.createTextNode(match[0]));
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    const s = document.createElement('span');
    s.className = 'ask-gradient';
    s.textContent = text.slice(last);
    el.appendChild(s);
  }
}

function renderViewer(data) {
  applyTheme(data.th || 'default');
  const premium = data.premium || {};
  const viewer = $('viewer');
  viewer.hidden = false;
  if (premium.pass) viewer.classList.add('no-brand');
  if (currentTheme === 'letter') setupEnvelope();

  if (data.photoUrl)   $('g-photo').src = data.photoUrl;  // served from /api/photo/:id
  else if (data.i)     $('g-photo').src = data.i;         // legacy hash links with embedded base64
  else                 $('g-photo-wrap').hidden = true;

  renderAskText($('g-ask'), `${data.n}, ${data.a || DEFAULT_ASK}`);
  document.title = `For ${data.n} 💌`;

  const when = formatWhen(data.d, data.t);
  $('g-when').textContent = when;  $('g-when-row').hidden = !when;
  $('g-where').textContent = data.p || ''; $('g-where-row').hidden = !data.p;
  $('g-details').hidden = !when && !data.p;

  $('conf-title').textContent = data.y || DEFAULT_YES;
  let confText;
  if (when && data.p)  confText = `See you ${when} at ${data.p} 🌹`;
  else if (when)       confText = `See you ${when} 🌹`;
  else if (data.p)     confText = `See you at ${data.p} 🌹`;
  else                 confText = `Can't wait! 🌹`;
  $('conf-text').textContent = confText;

  if (data.m) { $('g-message').textContent = '“' + data.m + '”'; $('g-message').hidden = false; }

  setupAnswers(data, {
    shownAt: performance.now(),
    statsCard: !!premium.stats,
    countdown: !!premium.pass,
  });
}

function formatWhen(d, t) {
  if (!d) return '';
  const dt = new Date(d + 'T' + (t || '19:00'));
  if (isNaN(dt)) return d + (t ? ' at ' + t : '');
  const dateStr = dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = t ? dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return timeStr ? `${dateStr} at ${timeStr}` : dateStr;
}

// ---------- Love-letter theme: envelope that opens on tap ----------
function setupEnvelope() {
  const card = $('viewer');
  const env = document.createElement('div');
  env.className = 'envelope';
  env.innerHTML = '<div class="env-back"></div><div class="env-flap"></div><div class="env-front"></div><div class="env-seal">💌</div><div class="env-hint">Tap to open</div>';
  card.classList.add('sealed');
  document.body.appendChild(env);
  env.addEventListener('click', () => {
    if (env.classList.contains('open')) return;
    env.classList.add('open');
    setTimeout(() => card.classList.remove('sealed'), 500);
    setTimeout(() => env.remove(), 1400);
  });
}

// ---------- Countdown to the date (Premium Pass) ----------
function startCountdown(d, t) {
  if (!d) return;
  const target = new Date(d + 'T' + (t || '19:00'));
  if (isNaN(target)) return;
  const box = $('countdown');
  box.hidden = false;
  const tick = () => {
    let ms = target - Date.now();
    if (ms <= 0) { $('countdown').querySelector('.countdown-label').textContent = "It's today 🎉"; ms = 0; }
    const s = Math.floor(ms / 1000);
    $('cd-d').textContent = Math.floor(s / 86400);
    $('cd-h').textContent = Math.floor(s % 86400 / 3600);
    $('cd-m').textContent = Math.floor(s % 3600 / 60);
    $('cd-s').textContent = s % 60;
  };
  tick();
  setInterval(tick, 1000);
}

// ---------- Add to calendar (.ics, generated locally) ----------
function setupCalendar(data) {
  if (!data.d) return;
  const btn = $('btn-calendar');
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const start = new Date(data.d + 'T' + (data.t || '19:00'));
    if (isNaN(start)) return;
    const end = new Date(start.getTime() + 2 * 3600e3);
    const fmt = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ask-her-out.com//EN', 'BEGIN:VEVENT',
      `UID:${(data.id || Date.now())}@ask-her-out.com`, `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${esc('Date with ' + data.n)} 💖`,
      ...(data.p ? [`LOCATION:${esc(data.p)}`] : []), ...(data.m ? [`DESCRIPTION:${esc(data.m)}`] : []),
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `date-with-${data.n}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

// ---------- Reaction stats card (premium) ----------
function formatDuration(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
function statsVerdict(noCount, ms) {
  if (noCount === 0 && ms < 5000) return 'Instant yes. Zero hesitation. 💘';
  if (noCount === 0)              return 'Took a moment to think, but never even tried to say no. 🥰';
  if (noCount < 4)                return `Tried to escape ${noCount} ${noCount === 1 ? 'time' : 'times'}, then gave in. 😏`;
  if (noCount < 10)               return `Chased the "No" button ${noCount} times and lost. 😂`;
  return `${noCount} attempts to click "No". Legendary stubbornness. Still said yes. 🏆`;
}
function showStatsCard(noCount, ms) {
  const card = $('stats-card');
  $('stat-time').textContent = formatDuration(ms);
  $('stat-chases').textContent = String(noCount);
  $('stat-verdict').textContent = statsVerdict(noCount, ms);
  card.hidden = false;
  const shareBtn = $('stats-share');
  const text = `I said yes to a date in ${formatDuration(ms)}` +
    (noCount > 0 ? ` after chasing the "No" button ${noCount} ${noCount === 1 ? 'time' : 'times'} 😂` : ' with zero hesitation 💘') +
    ` Make your own at ${location.origin}`;
  shareBtn.addEventListener('click', async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      shareBtn.textContent = 'Copied ✓';
      setTimeout(() => shareBtn.textContent = 'Share', 1500);
    } catch {}
  });
}

// -------------------------------------------------------------
//  Runaway "No" button
//  The button is positioned absolutely inside the .answer-buttons arena.
//  All math uses that arena's box, so it physically cannot leave the card.
// -------------------------------------------------------------
function setupAnswers(data, opts = {}) {
  const arena = $('answer-buttons');
  const yes = $('btn-yes');
  const no  = $('btn-no');
  let noCount = 0;

  const PAD = 6, STEP = 60, STEP_JITTER = 25;

  // Start to the right of the Yes button rather than on top of it
  let nx = Math.min(arena.clientWidth - no.offsetWidth - PAD, arena.clientWidth / 2 + yes.offsetWidth / 2 + 14);
  let ny = arena.clientHeight / 2 - no.offsetHeight / 2;
  no.style.transform = 'none';
  placeNo();

  function placeNo() {
    const maxX = arena.clientWidth  - no.offsetWidth  - PAD;
    const maxY = arena.clientHeight - no.offsetHeight - PAD;
    nx = Math.max(PAD, Math.min(maxX, nx));
    ny = Math.max(PAD, Math.min(maxY, ny));
    no.style.left = nx + 'px';
    no.style.top  = ny + 'px';
  }

  function flee(e) {
    const arenaRect = arena.getBoundingClientRect();
    const cx = nx + no.offsetWidth / 2, cy = ny + no.offsetHeight / 2;
    let dx, dy;
    const px = e && (e.clientX ?? e.touches?.[0]?.clientX);
    const py = e && (e.clientY ?? e.touches?.[0]?.clientY);
    if (px != null && py != null) { dx = cx - (px - arenaRect.left); dy = cy - (py - arenaRect.top); }
    else { dx = 0; dy = 0; }
    let len = Math.hypot(dx, dy);
    if (len < 1) { const a = Math.random() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); }
    else { dx /= len; dy /= len; }

    // Step far enough that the new box doesn't overlap the old one
    const w = no.offsetWidth, h = no.offsetHeight, BUFFER = 8;
    const minStep = Math.min(
      Math.abs(dx) > 0.01 ? w / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.01 ? h / Math.abs(dy) : Infinity
    ) + BUFFER;
    const step = Math.max(STEP, minStep) + Math.random() * STEP_JITTER;

    const prevX = nx, prevY = ny;
    nx += dx * step; ny += dy * step;
    placeNo();
    // Pinned against an edge: dodge perpendicular instead
    if (Math.abs(nx - prevX) < 4 && Math.abs(ny - prevY) < 4) {
      nx = prevX + (-dy) * step; ny = prevY + (dx) * step;
      placeNo();
    }
  }

  function fleeAndCount(e) { noCount++; flee(e); }
  no.addEventListener('mouseenter', fleeAndCount);
  no.addEventListener('focus',      fleeAndCount);
  no.addEventListener('touchstart', e => { e.preventDefault(); fleeAndCount(e); }, { passive: false });
  no.addEventListener('click',      e => { e.preventDefault(); fleeAndCount(e); });
  window.addEventListener('resize', placeNo);

  yes.addEventListener('click', () => {
    const hesitationMs = opts.shownAt != null ? Math.round(performance.now() - opts.shownAt) : null;
    confettiBurst();
    arena.style.display = 'none';
    $('confirmation').classList.add('show');
    setTimeout(confettiBurst, 500);
    setTimeout(confettiBurst, 1100);

    if (opts.countdown) startCountdown(data.d, data.t);
    setupCalendar(data);

    const mapQ = data.plat != null && data.plng != null ? `${data.plat},${data.plng}` : data.p ? encodeURIComponent(data.p) : null;
    if (mapQ && window.__MAPS_KEY__) {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.google.com/maps/embed/v1/place?key=${window.__MAPS_KEY__}&q=${mapQ}&zoom=15`;
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('loading', 'lazy');
      $('map-container').appendChild(iframe);
      $('map-container').hidden = false;
    }

    if (opts.statsCard && hesitationMs != null) showStatsCard(noCount, hesitationMs);

    // fire-and-forget notification, never blocks the UI
    if (window.__INVITE__?.id) {
      fetch('/api/yes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: window.__INVITE__.id, noCount, hesitationMs }),
      }).catch(() => {});
    }
  });
}

// ---------- Confetti ----------
function confettiBurst() {
  if (REDUCED_MOTION) return;
  const colors = ['#ff4d6d', '#ff8e53', '#ffd1dc', '#ffe5b4', '#ff6b9d', '#ffffff', '#ffc0cb'];
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < 70; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.background = colors[Math.floor(Math.random() * colors.length)];
    c.style.left = cx + 'px';
    c.style.top  = cy + 'px';
    c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(c);
    const angle = Math.random() * Math.PI * 2;
    const velocity = 200 + Math.random() * 420;
    const dx = Math.cos(angle) * velocity, dy = Math.sin(angle) * velocity;
    c.animate([
      { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy + 300}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1200 + Math.random() * 800, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => c.remove();
  }
}
