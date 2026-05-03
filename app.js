// =============================================================
//  ask-out  —  client-side invite generator + viewer
// =============================================================

// ---------- Floating background hearts ----------
(function spawnHearts() {
  const symbols = ['💗', '💖', '💕', '✨', '🌸', '🌷'];
  for (let i = 0; i < 14; i++) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.textContent = symbols[Math.floor(Math.random() * symbols.length)];
    h.style.left = (Math.random() * 100) + 'vw';
    h.style.fontSize = (18 + Math.random() * 24) + 'px';
    h.style.animationDuration = (10 + Math.random() * 14) + 's';
    h.style.animationDelay = (Math.random() * 12) + 's';
    document.body.appendChild(h);
  }
})();

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

// ---------- Mode switch ----------
const hash = location.hash.slice(1);
if (hash) {
  try { renderViewer(decodeData(hash)); }
  catch (e) {
    console.warn('Bad invite hash:', e);
    document.getElementById('creator').hidden = false;
  }
} else {
  document.getElementById('creator').hidden = false;
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
      preview.src = compressedImage;
      preview.classList.add('show');
      dropText.textContent = file.name + '  ✓';
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

const creatorForm = document.getElementById('creator-form');
if (creatorForm) {
  creatorForm.addEventListener('submit', e => {
    e.preventDefault();
    const err = document.getElementById('creator-error');
    err.textContent = '';

    const name  = document.getElementById('name').value.trim();
    const date  = document.getElementById('date').value;
    const time  = document.getElementById('time').value;
    const place = document.getElementById('place').value.trim();
    const msg   = document.getElementById('message').value.trim();

    if (!name)            { err.textContent = 'Please add her name.'; return; }
    if (!compressedImage) { err.textContent = 'Please add a photo.'; return; }
    if (!date || !time)   { err.textContent = 'Please pick a date and time.'; return; }
    if (!place)           { err.textContent = 'Please add a place.'; return; }

    const data = { n: name, d: date, t: time, p: place, m: msg, i: compressedImage };
    const url = location.origin + location.pathname + '#' + encodeData(data);

    document.getElementById('link-result').textContent = url;
    document.getElementById('link-output').hidden = false;
    document.getElementById('link-output').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

// =============================================================
//  VIEWER
// =============================================================
function renderViewer(data) {
  document.getElementById('viewer').hidden = false;
  document.getElementById('g-photo').src = data.i;
  document.getElementById('g-ask').textContent = `${data.n}, will you go out with me?`;
  document.title = `For ${data.n} 💌`;

  const when = formatWhen(data.d, data.t);
  document.getElementById('g-when').textContent = when;
  document.getElementById('g-where').textContent = data.p;
  document.getElementById('conf-when').textContent = when;
  document.getElementById('conf-where').textContent = data.p;
  if (data.m) {
    const m = document.getElementById('g-message');
    m.textContent = '“' + data.m + '”';
    m.hidden = false;
  }
  setupAnswers();
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
function setupAnswers() {
  const arena = document.getElementById('answer-buttons');
  const yes = document.getElementById('btn-yes');
  const no  = document.getElementById('btn-no');

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

  no.addEventListener('mouseenter', flee);
  no.addEventListener('focus',      flee);
  no.addEventListener('touchstart', e => { e.preventDefault(); flee(e); }, { passive: false });
  no.addEventListener('click',      e => { e.preventDefault(); flee(e); });

  // Keep the button in bounds if the window resizes mid-chase
  window.addEventListener('resize', placeNo);

  yes.addEventListener('click', () => {
    confettiBurst();
    arena.style.display = 'none';
    document.getElementById('confirmation').classList.add('show');
    setTimeout(confettiBurst, 500);
    setTimeout(confettiBurst, 1100);
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
