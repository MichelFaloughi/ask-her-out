// =============================================================
//  ask-out  —  client-side invite generator + viewer
// =============================================================

// ---------- Floating background particles ----------
// Each theme has a particle "kind": hearts (free themes), falling petals,
// or twinkling stars. Respawned whenever the theme changes.
const PARTICLES = {
  hearts: { symbols: ['💗', '💖', '💕', '✨', '🌸', '🌷'], count: 26 },
  petals: { symbols: ['🌸', '🌸', '🌸', '🌺', '💮'],      count: 34, cls: 'petal' },
  stars:  { symbols: ['✦', '✧', '★', '✦', '·'],           count: 60, cls: 'star' },
};
let currentParticles = null;
function spawnParticles(kind) {
  if (kind === currentParticles) return;
  currentParticles = kind;
  document.querySelectorAll('.heart').forEach(el => el.remove());
  const cfg = PARTICLES[kind] || PARTICLES.hearts;
  for (let i = 0; i < cfg.count; i++) {
    const h = document.createElement('div');
    h.className = 'heart' + (cfg.cls ? ' ' + cfg.cls : '');
    h.textContent = cfg.symbols[Math.floor(Math.random() * cfg.symbols.length)];
    h.style.left = (Math.random() * 100) + 'vw';
    if (kind === 'stars') {
      // Stars sit still and twinkle at random positions
      h.style.top = (Math.random() * 100) + 'vh';
      h.style.fontSize = (6 + Math.random() * 14) + 'px';
      h.style.animationDuration = (1.5 + Math.random() * 3) + 's';
      h.style.animationDelay = (-Math.random() * 4) + 's';
    } else {
      h.style.fontSize = (18 + Math.random() * 28) + 'px';
      h.style.animationDuration = (7 + Math.random() * 10) + 's';
      // Negative delay so particles start mid-animation — they're already
      // floating when the page loads instead of waiting offscreen.
      h.style.animationDelay = (-Math.random() * 14) + 's';
      h.style.setProperty('--drift', (40 + Math.random() * 80) * (Math.random() < 0.5 ? -1 : 1) + 'px');
    }
    document.body.appendChild(h);
  }
}
spawnParticles('hearts');

// ---------- UTF-8 safe base64 helpers ----------
function encodeData(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return encodeURIComponent(b64);
}
function decodeData(str) {
  const b64 = decodeURIComponent(str);
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

// ---------- Constants ----------
const DEFAULT_ASK = 'wanna go on a date?';

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
  spawnParticles(THEMES[t].particles);
}

// ---------- Payments feature flag (off unless the server says otherwise) ----------
let paymentsEnabled = false;

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
    }
    catch (e) {
      console.warn('Bad invite hash:', e);
      document.getElementById('creator').hidden = false;
    }
  } else {
    document.getElementById('creator').hidden = false;
    initPayments();
  }
}

// =============================================================
//  CREATOR
// =============================================================
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('image');
const preview = document.getElementById('preview');
const dropText = document.getElementById('drop-text');
let compressedImage = null;

if (fileInput) {
  fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('dragover'); })
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('dragover'); })
  );
  dropZone.addEventListener('drop', e => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
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
        dropText.textContent = 'Image too large — please use a smaller one.';
        compressedImage = null;
        return;
      }
      preview.src = compressedImage;
      preview.classList.add('show');
      dropText.textContent = file.name + '  ✓';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ---------- Places autocomplete (custom UI on Places REST API) ----------
let selectedLat = null, selectedLng = null;
const PLACES_API = 'https://places.googleapis.com/v1';

function setupPlaceAutocomplete() {
  const input = document.getElementById('place');
  if (!input || !window.__MAPS_KEY__) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'place-wrapper';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const dropdown = document.createElement('div');
  dropdown.className = 'place-dropdown';
  dropdown.hidden = true;
  wrapper.appendChild(dropdown);

  let debounceTimer = null;
  let abortCtrl = null;

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

  document.addEventListener('click', e => {
    if (!wrapper.contains(e.target)) dropdown.hidden = true;
  });
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
  const name = prediction.structuredFormat?.mainText?.text || prediction.text?.text || '';
  input.value = name;
  dropdown.hidden = true;
  try {
    const res = await fetch(`${PLACES_API}/places/${prediction.placeId}`, {
      headers: { 'X-Goog-Api-Key': window.__MAPS_KEY__, 'X-Goog-FieldMask': 'location' },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.location) {
      selectedLat = data.location.latitude;
      selectedLng = data.location.longitude;
    }
  } catch (e) { console.warn('place details', e); }
}

setupPlaceAutocomplete();

// ---------- Ask phrase counter ----------
const askInput = document.getElementById('ask-phrase');
const askCount = document.getElementById('ask-count');
if (askInput && askCount) {
  askInput.addEventListener('input', () => {
    askCount.textContent = askInput.value.length;
  });
}

// ---------- Theme picker ----------
const themePicker = document.getElementById('theme-picker');
if (themePicker) {
  themePicker.addEventListener('click', e => {
    const btn = e.target.closest('.theme-swatch');
    if (!btn) return;
    applyTheme(btn.dataset.theme);
    themePicker.querySelectorAll('.theme-swatch').forEach(b =>
      b.classList.toggle('active', b === btn)
    );
  });
}

const creatorForm = document.getElementById('creator-form');
if (creatorForm) {
  creatorForm.addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('creator-error');
    err.textContent = '';

    const name  = document.getElementById('name').value.trim();
    const email = document.getElementById('creator-email').value.trim();
    const date  = document.getElementById('date').value;
    const time  = document.getElementById('time').value;
    const place = document.getElementById('place').value.trim();
    const msg   = document.getElementById('message').value.trim();
    const ask   = document.getElementById('ask-phrase').value.trim();

    if (!name) { err.textContent = 'Please add her name.'; return; }

    const submitBtn = creatorForm.querySelector('button[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating link…';

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite: { n: name, d: date, t: time, p: place, m: msg, th: currentTheme, ...(ask && { a: ask }), ...(email && { email }), ...(selectedLat != null && { plat: selectedLat, plng: selectedLng }) },
          imageDataUrl: compressedImage || null,
        }),
      });
      if (!res.ok) throw new Error('Server error ' + res.status);
      const { id } = await res.json();

      const items = [];
      if (THEMES[currentTheme]?.premium) items.push('theme');
      if (document.getElementById('stats-addon-check')?.checked) items.push('stats');
      if (paymentsEnabled && items.length) {
        submitBtn.textContent = 'Redirecting to checkout…';
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

      showLink(id);
    } catch {
      err.textContent = 'Something went wrong. Please try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate link 💌';
    }
  });

  document.getElementById('copy-btn').addEventListener('click', async () => {
    const url = document.getElementById('link-result').textContent;
    const btn = document.getElementById('copy-btn');
    try {
      await navigator.clipboard.writeText(url);
      const orig = btn.textContent;
      btn.textContent = 'Copied! ✓';
      setTimeout(() => btn.textContent = orig, 1500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('link-result'));
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      btn.textContent = 'Press ⌘C to copy';
    }
  });
}

function showLink(id, note) {
  document.getElementById('link-result').textContent = location.origin + '/a/' + id;
  const noteEl = document.getElementById('payment-note');
  if (noteEl) { noteEl.textContent = note || ''; noteEl.hidden = !note; }
  const linkOutput = document.getElementById('link-output');
  linkOutput.hidden = false;
  try { linkOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
}

// Reveals premium options only when the server flag is on, and handles
// returning from Stripe Checkout (?paid=<id> or ?canceled=<id>).
async function initPayments() {
  const params = new URLSearchParams(location.search);
  const paidId = params.get('paid');
  const canceledId = params.get('canceled');
  if (paidId && /^[\w-]{6,12}$/.test(paidId)) {
    showLink(paidId, 'Payment received ✓ Your premium extras are unlocked on this link.');
  } else if (canceledId && /^[\w-]{6,12}$/.test(canceledId)) {
    showLink(canceledId, 'Checkout canceled. Your link still works, with the free theme and no stats card.');
  }
  if (paidId || canceledId) history.replaceState(null, '', location.pathname);

  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();
    paymentsEnabled = !!cfg.paymentsEnabled;
  } catch {}
  if (!paymentsEnabled) return;
  document.querySelectorAll('.theme-swatch.premium').forEach(b => { b.hidden = false; });
  const addon = document.getElementById('stats-addon');
  if (addon) addon.hidden = false;
}

// =============================================================
//  VIEWER
// =============================================================

// Splits text into emoji and non-emoji spans so the gradient applies only to
// regular characters — emoji need a non-transparent color to render their colors.
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
  document.getElementById('viewer').hidden = false;
  if (currentTheme === 'letter') setupEnvelope();

  const photo = document.getElementById('g-photo');
  if (data.photoUrl) {
    photo.src = data.photoUrl;  // served from /api/photo/:id
  } else if (data.i) {
    photo.src = data.i;         // legacy hash-based links with embedded base64
  } else {
    photo.hidden = true;
  }

  renderAskText(document.getElementById('g-ask'), `${data.n}, ${data.a || DEFAULT_ASK}`);
  document.title = `For ${data.n} 💌`;

  const when = formatWhen(data.d, data.t);
  const whenRow  = document.getElementById('g-when').parentElement;
  const whereRow = document.getElementById('g-where').parentElement;
  const details  = document.querySelector('#viewer .details');

  if (when) {
    document.getElementById('g-when').textContent = when;
  } else {
    whenRow.hidden = true;
  }

  if (data.p) {
    document.getElementById('g-where').textContent = data.p;
  } else {
    whereRow.hidden = true;
  }

  if (!when && !data.p) details.hidden = true;

  let confText = '';
  if (when && data.p)      confText = `See you ${when} at ${data.p} 🌹`;
  else if (when)           confText = `See you ${when} 🌹`;
  else if (data.p)         confText = `See you at ${data.p} 🌹`;
  else                     confText = `Can't wait! 🌹`;
  document.getElementById('conf-text').textContent = confText;

  if (data.m) {
    const m = document.getElementById('g-message');
    m.textContent = '“' + data.m + '”';
    m.hidden = false;
  }
  setupAnswers(data.plat, data.plng, data.p, {
    shownAt: performance.now(),
    statsCard: !!data.premium?.stats,
    name: data.n,
  });
}

// ---------- Love-letter theme: envelope that opens on tap ----------
function setupEnvelope() {
  const card = document.getElementById('viewer');
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

// ---------- Reaction stats card (premium add-on) ----------
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
function showStatsCard(noCount, ms, name) {
  const card = document.getElementById('stats-card');
  if (!card) return;
  document.getElementById('stat-time').textContent = formatDuration(ms);
  document.getElementById('stat-chases').textContent = String(noCount);
  document.getElementById('stat-verdict').textContent = statsVerdict(noCount, ms);
  card.hidden = false;

  const shareBtn = document.getElementById('stats-share');
  const text = `I said yes to a date in ${formatDuration(ms)}` +
    (noCount > 0 ? ` after chasing the "No" button ${noCount} ${noCount === 1 ? 'time' : 'times'} 😂` : ' with zero hesitation 💘') +
    ` Make your own at ${location.origin}`;
  shareBtn.addEventListener('click', async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      shareBtn.textContent = 'Copied! ✓';
      setTimeout(() => shareBtn.textContent = 'Share 📤', 1500);
    } catch {}
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

// -------------------------------------------------------------
//  Runaway "No" button
//
//  Strategy: the button is positioned ABSOLUTELY inside the
//  .answer-buttons arena (its CSS parent). All math uses that
//  arena's box, so the button physically cannot leave the card.
//  We track its position in a local (px, px) variable instead of
//  re-reading the DOM each event — no transition / reflow races.
// -------------------------------------------------------------
function setupAnswers(plat, plng, placeName, opts = {}) {
  const arena = document.getElementById('answer-buttons');
  const yes = document.getElementById('btn-yes');
  const no  = document.getElementById('btn-no');
  let noCount = 0;

  const PAD = 6;          // px gap from arena edge
  const STEP = 60;        // px per dodge
  const STEP_JITTER = 25;

  // Initial center of the arena
  let nx = arena.clientWidth  / 2 - no.offsetWidth  / 2;
  let ny = arena.clientHeight / 2 - no.offsetHeight / 2;

  // Switch from "centered via translate" to explicit left/top
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
    const cx = nx + no.offsetWidth  / 2;   // button center, arena-local
    const cy = ny + no.offsetHeight / 2;

    let dx, dy;
    const px = e && (e.clientX ?? e.touches?.[0]?.clientX);
    const py = e && (e.clientY ?? e.touches?.[0]?.clientY);
    if (px != null && py != null) {
      dx = cx - (px - arenaRect.left);
      dy = cy - (py - arenaRect.top);
    } else {
      dx = 0; dy = 0;
    }
    let len = Math.hypot(dx, dy);
    if (len < 1) {
      // No useful direction (cursor near center, or focus event) — random
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a); dy = Math.sin(a);
    } else {
      dx /= len; dy /= len;
    }

    // Make the step at least big enough that the button's new bounding box
    // doesn't overlap the old one — i.e. the cursor that triggered this dodge
    // can't still be over the button afterwards.
    const w = no.offsetWidth, h = no.offsetHeight;
    const BUFFER = 8;
    const minStep = Math.min(
      Math.abs(dx) > 0.01 ? w / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.01 ? h / Math.abs(dy) : Infinity
    ) + BUFFER;
    const step = Math.max(STEP, minStep) + Math.random() * STEP_JITTER;

    const prevX = nx, prevY = ny;
    nx += dx * step;
    ny += dy * step;
    placeNo();

    // If clamping pinned it against an edge, dodge perpendicular instead
    if (Math.abs(nx - prevX) < 4 && Math.abs(ny - prevY) < 4) {
      nx = prevX + (-dy) * step;
      ny = prevY + ( dx) * step;
      placeNo();
    }
  }

  function fleeAndCount(e) { noCount++; flee(e); }
  no.addEventListener('mouseenter', fleeAndCount);
  no.addEventListener('focus',      fleeAndCount);
  no.addEventListener('touchstart', e => { e.preventDefault(); fleeAndCount(e); }, { passive: false });
  no.addEventListener('click',      e => { e.preventDefault(); fleeAndCount(e); });

  // Keep the button in bounds if the window resizes mid-chase
  window.addEventListener('resize', placeNo);

  yes.addEventListener('click', () => {
    const hesitationMs = opts.shownAt != null ? Math.round(performance.now() - opts.shownAt) : null;
    confettiBurst();
    arena.style.display = 'none';
    document.getElementById('confirmation').classList.add('show');
    setTimeout(confettiBurst, 500);
    setTimeout(confettiBurst, 1100);

    const mapQ = plat != null && plng != null
      ? `${plat},${plng}`
      : placeName ? encodeURIComponent(placeName) : null;
    if (mapQ && window.__MAPS_KEY__) {
      const mapContainer = document.getElementById('map-container');
      if (mapContainer) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.google.com/maps/embed/v1/place?key=${window.__MAPS_KEY__}&q=${mapQ}&zoom=15`;
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        mapContainer.appendChild(iframe);
        mapContainer.hidden = false;
      }
    }

    if (opts.statsCard && hesitationMs != null) showStatsCard(noCount, hesitationMs, opts.name);

    // fire-and-forget notification — don't block the UI
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
  const colors = ['#ff4d6d', '#ff8e53', '#ffd1dc', '#ffe5b4', '#ff6b9d', '#ffffff', '#ffc0cb'];
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;
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
    const dx = Math.cos(angle) * velocity;
    const dy = Math.sin(angle) * velocity;
    const rot = Math.random() * 720 - 360;

    c.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy + 420}px) rotate(${rot}deg)`, opacity: 0 }
      ],
      { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)' }
    ).onfinish = () => c.remove();
  }
}
