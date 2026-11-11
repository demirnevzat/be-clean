'use strict';

/* ---------- Storage (everything stays on this device) ---------- */
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('beclean.' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('beclean.' + key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
  },
  clear() {
    try { Object.keys(localStorage).filter(k => k.startsWith('beclean.')).forEach(k => localStorage.removeItem(k)); } catch {}
  },
};

let profile = store.get('profile', null);
let journal = store.get('journal', {});   // { 'YYYY-MM-DD': { mood, craving, triggers, note } }

const saveProfile = () => store.set('profile', profile);
const saveJournal = () => store.set('journal', journal);

/* ---------- Constants ---------- */
const HABITS = [
  ['smoking', 'Smoking'], ['vaping', 'Vaping'], ['alcohol', 'Alcohol'], ['gambling', 'Gambling'],
  ['porn', 'Porn'], ['social', 'Social media'], ['cannabis', 'Cannabis'], ['drugs', 'Drugs'],
  ['gaming', 'Gaming'], ['sugar', 'Sugar'], ['other', 'Something else'],
];
const DAY = 86400000;
const MILESTONES = [
  [DAY, '1 day'], [3 * DAY, '3 days'], [7 * DAY, '1 week'], [14 * DAY, '2 weeks'],
  [30 * DAY, '30 days'], [90 * DAY, '90 days'], [182 * DAY, '6 months'], [365 * DAY, '1 year'],
];
const MOODS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
const TRIGGERS = ['Stress', 'Boredom', 'Lonely', 'Tired', 'Angry', 'Friends', 'Party', 'After eating', 'Bedtime', 'Phone', 'Work', 'Sad'];
const DISTRACTIONS = [
  'Drink a full glass of cold water, slowly.',
  'Walk outside for 5 minutes. Notice 5 things you can see.',
  'Do 20 push-ups or squats.',
  'Text or call someone you trust.',
  'Take a cold shower or splash cold water on your face.',
  'Put on one song you love and just listen.',
  'Write down exactly what you are feeling right now.',
  'Chew gum or eat something crunchy.',
  'Tidy one small area for 5 minutes.',
  'Name the craving: "This is a craving. It will pass."',
  'Do the breathing exercise above three more times.',
  'Move to a different room or go outside.',
];
const HELPLINE_URL = 'https://findahelpline.com';

/* ---------- Helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const habitLabel = () => profile.habit === 'other' ? (profile.customHabit || 'your habit') : (HABITS.find(h => h[0] === profile.habit)?.[1] || 'your habit');
const elapsed = () => Math.max(0, Date.now() - profile.quitAt);

function formatDuration(ms) {
  const d = Math.floor(ms / DAY);
  const h = Math.floor(ms / 3600000) % 24;
  const m = Math.floor(ms / 60000) % 60;
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}${h ? `, ${h} h` : ''}`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
function money(amount) {
  const sym = profile.currency || '$';
  return sym + amount.toLocaleString(undefined, { maximumFractionDigits: amount < 100 ? 2 : 0, minimumFractionDigits: 0 });
}
function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let tickTimer = null;
function setTick(fn, ms = 1000) {
  clearInterval(tickTimer);
  tickTimer = fn ? setInterval(fn, ms) : null;
}
let cleanup = null; // per-view teardown (breathing loops, timers)

/* ---------- Modal ---------- */
function openModal(html, onMount) {
  const modal = $('#modal');
  modal.innerHTML = `<div class="sheet">${html}</div>`;
  modal.hidden = false;
  modal.onclick = e => { if (e.target === modal) closeModal(); };
  onMount?.($('.sheet', modal));
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; }

/* ---------- Router ---------- */
let currentTab = 'home';
const views = { home: renderHome, journal: renderJournal, sos: renderSOS, light: renderLight, coach: renderCoach, settings: renderSettings };

function go(tab) {
  cleanup?.(); cleanup = null;
  setTick(null);
  currentTab = tab;
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  views[tab]();
}

function start() {
  $$('#tabbar button').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
  $('#settingsBtn').addEventListener('click', () => go('settings'));
  if (!profile) return renderOnboarding();
  $('#tabbar').hidden = false;
  $('#settingsBtn').hidden = false;
  go('home');
}

/* ---------- Onboarding / profile form ---------- */
function profileForm(p = {}) {
  return `
    <label class="field"><span>What are you quitting?</span>
      <div class="chips" id="habitChips">
        ${HABITS.map(([id, label]) => `<button type="button" class="chip ${p.habit === id ? 'on' : ''}" data-habit="${id}">${label}</button>`).join('')}
      </div>
    </label>
    <label class="field ${p.habit === 'other' ? '' : 'hidden'}" id="customField"><span>Name it</span>
      <input type="text" id="customHabit" maxlength="40" placeholder="e.g. Energy drinks" value="${esc(p.customHabit)}">
    </label>
    <label class="field"><span>When did you quit (or when will you)?</span>
      <input type="datetime-local" id="quitAt" value="${toLocalInput(p.quitAt || Date.now())}">
    </label>
    <div class="row">
      <label class="field"><span>Money spent per day</span>
        <input type="number" id="cost" inputmode="decimal" min="0" step="0.5" placeholder="10" value="${p.costPerDay ?? ''}">
      </label>
      <label class="field" style="flex:0 0 90px"><span>Currency</span>
        <input type="text" id="currency" maxlength="4" value="${esc(p.currency || '$')}">
      </label>
    </div>
    <label class="field"><span>Your reasons to quit (one per line)</span>
      <textarea id="reasons" placeholder="I want to be there for my kids&#10;I want my health back&#10;I want to feel free">${esc((p.reasons || []).join('\n'))}</textarea>
    </label>`;
}
function bindProfileForm(root, state) {
  $$('[data-habit]', root).forEach(b => b.addEventListener('click', () => {
    state.habit = b.dataset.habit;
    $$('[data-habit]', root).forEach(x => x.classList.toggle('on', x === b));
    $('#customField', root).classList.toggle('hidden', state.habit !== 'other');
  }));
}
function readProfileForm(root, state) {
  const quitAt = new Date($('#quitAt', root).value).getTime();
  return {
    habit: state.habit,
    customHabit: $('#customHabit', root).value.trim(),
    quitAt: Number.isFinite(quitAt) ? quitAt : Date.now(),
    costPerDay: Math.max(0, parseFloat($('#cost', root).value) || 0),
    currency: $('#currency', root).value.trim() || '$',
    reasons: $('#reasons', root).value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 8),
  };
}

function renderOnboarding() {
  const state = { habit: null };
  $('#view').innerHTML = `
    <div class="onboard">
      <h1>A fresh start.</h1>
      <p class="muted">Everything you enter stays on this phone. No account, no sign-up.</p>
      <div style="height:16px"></div>
      ${profileForm()}
      <button class="btn primary" id="begin">Begin</button>
    </div>`;
  const root = $('#view');
  bindProfileForm(root, state);
  $('#begin').addEventListener('click', () => {
    if (!state.habit) { $('#habitChips').scrollIntoView({ behavior: 'smooth' }); return flash($('#habitChips')); }
    profile = { ...readProfileForm(root, state), longestMs: 0, slips: [], lightEnabled: true, lightWarned: false, plans: [] };
    saveProfile();
    start();
  });
}
function flash(el) { el.animate([{ opacity: 1 }, { opacity: .3 }, { opacity: 1 }], { duration: 500 }); }

/* ---------- Home ---------- */
function renderHome() {
  const reasons = profile.reasons || [];
  $('#view').innerHTML = `
    <div class="card streak">
      <div class="streak-label">Free from ${esc(habitLabel().toLowerCase())}</div>
      <div class="streak-days" id="days">0</div>
      <div class="streak-unit" id="daysUnit">days</div>
      <div class="clock">
        <div><b id="hh">00</b><span>hours</span></div>
        <div><b id="mm">00</b><span>min</span></div>
        <div><b id="ss">00</b><span>sec</span></div>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <div class="card"><div class="stat-value" id="saved">${money(0)}</div><div class="stat-label">money saved</div></div>
      <div class="card"><div class="stat-value" id="best">0d</div><div class="stat-label">longest streak</div></div>
    </div>

    <h2>Milestones</h2>
    <div class="card">
      <div class="milestones" id="milestones"></div>
      <div class="small muted" style="margin-top:14px" id="nextLabel"></div>
      <div class="progress"><div id="nextBar" style="width:0"></div></div>
    </div>

    ${reasons.length ? `<h2>Why you're doing this</h2>
      <div class="card"><ul class="reasons">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}

    <h2>Today</h2>
    <div class="stack">
      <button class="btn" id="checkin">${journal[dateKey()] ? 'Update today’s check-in' : 'Do today’s check-in'}</button>
      <button class="btn subtle-danger" id="slip">I slipped</button>
    </div>`;

  const update = () => {
    const ms = elapsed();
    const d = Math.floor(ms / DAY);
    $('#days').textContent = d;
    $('#daysUnit').textContent = d === 1 ? 'day' : 'days';
    $('#hh').textContent = pad(Math.floor(ms / 3600000) % 24);
    $('#mm').textContent = pad(Math.floor(ms / 60000) % 60);
    $('#ss').textContent = pad(Math.floor(ms / 1000) % 60);
    $('#saved').textContent = money((profile.costPerDay || 0) * ms / DAY);
    $('#best').textContent = Math.floor(Math.max(profile.longestMs || 0, ms) / DAY) + 'd';

    $('#milestones').innerHTML = MILESTONES.map(([t, l]) => `<span class="pill ${ms >= t ? 'done' : ''}">${l}</span>`).join('');
    const next = MILESTONES.find(([t]) => ms < t);
    if (next) {
      const prev = [...MILESTONES].reverse().find(([t]) => ms >= t)?.[0] || 0;
      $('#nextLabel').textContent = `${formatDuration(next[0] - ms)} until ${next[1]}`;
      $('#nextBar').style.width = ((ms - prev) / (next[0] - prev) * 100).toFixed(1) + '%';
    } else {
      $('#nextLabel').textContent = 'Every milestone reached. You did this.';
      $('#nextBar').style.width = '100%';
    }
  };
  update();
  setTick(update);

  $('#checkin').addEventListener('click', () => go('journal'));
  $('#slip').addEventListener('click', confirmSlip);
}

function confirmSlip() {
  openModal(`
    <h1 style="font-size:22px">It's okay. Be honest with yourself.</h1>
    <p class="muted">A slip is not the end. Resetting your counter keeps your record true, and your longest streak is saved.</p>
    <label class="field"><span>What happened? (optional)</span>
      <textarea id="slipNote" placeholder="Where were you, how were you feeling?"></textarea></label>
    <div class="stack">
      <button class="btn danger" id="doSlip">Reset my counter</button>
      <button class="btn ghost" id="cancelSlip">Cancel</button>
    </div>`, sheet => {
    $('#cancelSlip', sheet).onclick = closeModal;
    $('#doSlip', sheet).onclick = () => {
      const ms = elapsed();
      profile.longestMs = Math.max(profile.longestMs || 0, ms);
      profile.slips = [...(profile.slips || []), { at: Date.now(), afterMs: ms, note: $('#slipNote', sheet).value.trim() }].slice(-100);
      profile.quitAt = Date.now();
      saveProfile();
      openModal(`
        <h1 style="font-size:22px">You stayed clean for ${formatDuration(ms)}.</h1>
        <p class="muted">That counts. Your brain built new paths during that time, and they're still there. Start again right now. Not tomorrow.</p>
        <div class="stack">
          <button class="btn primary" id="talk">Talk it through with the coach</button>
          <button class="btn ghost" id="ok">Close</button>
        </div>`, s => {
        $('#ok', s).onclick = () => { closeModal(); go('home'); };
        $('#talk', s).onclick = () => { closeModal(); go('coach'); };
      });
    };
  });
}

/* ---------- SOS ---------- */
function renderSOS() {
  const reasons = profile.reasons || [];
  $('#view').innerHTML = `
    <h1>Ride it out.</h1>
    <p class="muted">Cravings peak and pass, usually within 10 to 20 minutes. You don't have to act on this one.</p>

    <div class="card">
      <div class="breath-wrap"><div class="breath" id="breath"><div class="breath-text" id="breathText">Tap to breathe</div></div></div>
      <p class="small muted center" style="margin:10px 0 0">In for 4, hold for 4, out for 6.</p>
    </div>

    <h2>Wait 10 minutes</h2>
    <div class="card">
      <div class="timer-big" id="sosTimer">10:00</div>
      <button class="btn primary" id="sosStart">Start the timer</button>
    </div>

    <h2>Do this instead</h2>
    <div class="card">
      <div class="idea" id="idea"></div>
      <button class="btn" id="nextIdea" style="margin-top:10px">Another idea</button>
    </div>

    ${reasons.length ? `<h2>Remember why</h2><div class="card"><ul class="reasons">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}

    <h2>More help</h2>
    <div class="stack">
      <button class="btn" id="sosLight">Do a 20-second light reset</button>
      <button class="btn" id="sosCoach">Talk to the coach</button>
      <a class="btn subtle-danger" href="${HELPLINE_URL}" target="_blank" rel="noopener" style="text-decoration:none">Find a helpline near you</a>
    </div>`;

  // Breathing
  const breath = $('#breath'), text = $('#breathText');
  let breathing = false, breathTimers = [];
  const cycle = () => {
    breath.className = 'breath inhale'; text.textContent = 'Breathe in';
    breathTimers.push(setTimeout(() => { breath.className = 'breath hold'; text.textContent = 'Hold'; }, 4000));
    breathTimers.push(setTimeout(() => { breath.className = 'breath exhale'; text.textContent = 'Breathe out'; }, 8000));
    breathTimers.push(setTimeout(() => breathing && cycle(), 14000));
  };
  const stopBreath = () => { breathing = false; breathTimers.forEach(clearTimeout); breathTimers = []; breath.className = 'breath'; text.textContent = 'Tap to breathe'; };
  breath.addEventListener('click', () => breathing ? stopBreath() : (breathing = true, cycle()));

  // 10-minute timer
  let end = null;
  const renderTimer = () => {
    const left = Math.max(0, end - Date.now());
    $('#sosTimer').textContent = `${pad(Math.floor(left / 60000))}:${pad(Math.floor(left / 1000) % 60)}`;
    if (left === 0) {
      setTick(null); end = null;
      $('#sosTimer').textContent = 'You made it.';
      $('#sosStart').textContent = 'Start again';
    }
  };
  $('#sosStart').addEventListener('click', () => {
    if (end) { end = null; setTick(null); $('#sosTimer').textContent = '10:00'; $('#sosStart').textContent = 'Start the timer'; return; }
    end = Date.now() + 10 * 60000;
    $('#sosStart').textContent = 'Stop';
    renderTimer(); setTick(renderTimer, 250);
  });

  // Distractions
  let ideaIdx = Math.floor(Math.random() * DISTRACTIONS.length);
  const showIdea = () => { $('#idea').textContent = DISTRACTIONS[ideaIdx]; };
  showIdea();
  $('#nextIdea').addEventListener('click', () => { ideaIdx = (ideaIdx + 1) % DISTRACTIONS.length; showIdea(); });

  $('#sosLight').addEventListener('click', () => go('light'));
  $('#sosCoach').addEventListener('click', () => go('coach'));
  cleanup = stopBreath;
}

/* ---------- Light reset ---------- */
function renderLight() {
  $('#view').innerHTML = `
    <h1>Light reset</h1>
    <p class="muted">Close your eyes and let slow, soft light wash over your eyelids for 20 seconds. A short pause that breaks the craving loop and calms your mind.</p>
    <div class="card">
      <p class="small muted" style="margin:0 0 14px">How it works: tap start, close your eyes, hold the phone about 30 cm (one foot) from your face. A soft tone tells you when it's over.</p>
      <button class="btn primary" id="lightStart" ${profile.lightEnabled === false ? 'disabled' : ''}>Start 20-second reset</button>
      ${profile.lightEnabled === false ? '<p class="small muted center" style="margin:12px 0 0">Turned off in Settings.</p>' : ''}
    </div>
    <h2>Safety</h2>
    <div class="card small muted">
      The light pulses slowly, once every 2 seconds, which is far below the speed known to trigger seizures.
      Still, don't use it if you have epilepsy or have ever had a seizure, a migraine from light, or an eye condition.
      This is a relaxation exercise, not a medical treatment.
    </div>`;
  $('#lightStart').addEventListener('click', () => {
    if (!profile.lightWarned) return lightWarning();
    runLightSession();
  });
}

function lightWarning() {
  openModal(`
    <h1 style="font-size:22px">Before your first light reset</h1>
    <p class="muted">The screen will slowly pulse soft colours for 20 seconds. Do not use this if you have epilepsy, have had a seizure, or get migraines from light. Stop at any time by tapping the screen.</p>
    <div class="stack">
      <button class="btn primary" id="okLight">I understand, start</button>
      <button class="btn ghost" id="noLight">Not now</button>
    </div>`, s => {
    $('#noLight', s).onclick = closeModal;
    $('#okLight', s).onclick = () => { profile.lightWarned = true; saveProfile(); closeModal(); runLightSession(); };
  });
}

function playTone(ctx, freq = 528, dur = 1.2) {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch {}
}

async function runLightSession() {
  const overlay = $('#lightOverlay');
  let audio = null;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}

  const timers = [];
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    timers.forEach(t => { clearTimeout(t); clearInterval(t); });
    overlay.hidden = true; overlay.className = 'light-overlay'; overlay.onclick = null;
    try { wakeLock?.release(); } catch {}
    setTimeout(() => { try { audio?.close(); } catch {} }, 1500);
  };

  overlay.className = 'light-overlay';
  overlay.hidden = false;
  overlay.innerHTML = `<h1>Close your eyes</h1><div class="light-count" id="lc">Starting in 3</div><p class="small" style="color:rgba(255,255,255,.4);margin-top:24px">Tap anywhere to stop</p>`;
  overlay.onclick = finish;

  let n = 3;
  const pre = setInterval(() => {
    n--;
    if (n > 0) { $('#lc').textContent = `Starting in ${n}`; return; }
    clearInterval(pre);
    playTone(audio, 396, 0.8);
    overlay.innerHTML = `<div class="light-count" id="lc" style="position:absolute;bottom:40px">20</div>`;
    const colours = ['', 'c2', 'c3'];
    let i = 0;
    overlay.className = 'light-overlay pulsing';
    // Change colour every ~6.7 s so the 20 s session moves through warm, blue and green.
    timers.push(setInterval(() => { i = (i + 1) % colours.length; overlay.className = 'light-overlay pulsing ' + colours[i]; }, 6667));
    const endAt = Date.now() + 20000;
    timers.push(setInterval(() => {
      const left = Math.ceil((endAt - Date.now()) / 1000);
      const lc = $('#lc'); if (lc) lc.textContent = Math.max(0, left);
      if (left <= 0) {
        timers.forEach(t => clearInterval(t));
        playTone(audio, 528, 1.6);
        overlay.className = 'light-overlay';
        overlay.innerHTML = `<h1>Slowly open your eyes</h1><p class="muted">Take one deep breath. Notice how you feel right now.</p><button class="btn primary" id="lightDone">Done</button>`;
        overlay.onclick = null;
        $('#lightDone').onclick = e => { e.stopPropagation(); finish(); };
        profile.lightSessions = (profile.lightSessions || 0) + 1; saveProfile();
      }
    }, 250));
  }, 1000);
  timers.push(pre);
}

/* ---------- Journal ---------- */
function renderJournal() {
  const today = dateKey();
  const entry = journal[today] || { mood: null, craving: 0, triggers: [], note: '' };
  const state = { ...entry, triggers: [...(entry.triggers || [])] };

  $('#view').innerHTML = `
    <h1>Check-in</h1>
    <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>

    <div class="card">
      <label class="field"><span>How are you feeling?</span>
        <div class="scale" id="moods">${MOODS.map((m, i) => `<button type="button" data-mood="${i + 1}" class="${state.mood === i + 1 ? 'on' : ''}">${m}</button>`).join('')}</div>
      </label>
      <label class="field"><span>Craving strength: <b id="cv">${state.craving}</b> / 10</span>
        <input type="range" min="0" max="10" step="1" id="craving" value="${state.craving}">
      </label>
      <label class="field"><span>Triggers today</span>
        <div class="chips" id="triggers">${TRIGGERS.map(t => `<button type="button" class="chip ${state.triggers.includes(t) ? 'on' : ''}" data-trig="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </label>
      <label class="field" style="margin-bottom:14px"><span>Notes</span>
        <textarea id="note" maxlength="2000" placeholder="What went well? What was hard?">${esc(state.note)}</textarea>
      </label>
      <button class="btn primary" id="saveEntry">${journal[today] ? 'Update check-in' : 'Save check-in'}</button>
    </div>

    <h2>Last 14 days</h2>
    <div class="card chart" id="chart"></div>

    <h2>Top triggers</h2>
    <div class="card" id="topTriggers"></div>

    <h2>History</h2>
    <div class="card" id="history"></div>`;

  $$('[data-mood]').forEach(b => b.addEventListener('click', () => {
    state.mood = +b.dataset.mood;
    $$('[data-mood]').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#craving').addEventListener('input', e => { state.craving = +e.target.value; $('#cv').textContent = state.craving; });
  $$('[data-trig]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.trig;
    state.triggers = state.triggers.includes(t) ? state.triggers.filter(x => x !== t) : [...state.triggers, t];
    b.classList.toggle('on');
  }));
  $('#saveEntry').addEventListener('click', () => {
    if (!state.mood) return flash($('#moods'));
    state.note = $('#note').value.trim();
    journal[today] = { mood: state.mood, craving: state.craving, triggers: state.triggers, note: state.note };
    saveJournal();
    $('#saveEntry').textContent = 'Saved ✓';
    setTimeout(renderJournal, 700);
  });

  renderChart();
  renderTopTriggers();
  renderHistory();
}

function renderChart() {
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(dateKey(new Date(Date.now() - i * DAY)));
  const W = 320, H = 140, padL = 4, padB = 18, bw = (W - padL * 2) / 14;
  const y = v => (H - padB) - v * (H - padB - 8);
  let bars = '', points = [];
  days.forEach((k, i) => {
    const e = journal[k];
    const x = padL + i * bw;
    if (e) {
      const h = (e.craving / 10) * (H - padB - 8);
      bars += `<rect x="${x + bw * 0.22}" y="${H - padB - h}" width="${bw * 0.56}" height="${Math.max(h, 1)}" rx="3" fill="var(--danger)" opacity="0.55"/>`;
      points.push([x + bw / 2, y((e.mood - 1) / 4)]);
    }
    if (i % 2 === 1 || i === 13) bars += `<text x="${x + bw / 2}" y="${H - 4}" fill="var(--faint)" font-size="9" text-anchor="middle">${+k.slice(8)}</text>`;
  });
  const line = points.length > 1 ? `<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` : '';
  const dots = points.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="3.2" fill="var(--accent)"/>`).join('');
  const empty = !days.some(k => journal[k]);
  $('#chart').innerHTML = empty
    ? `<p class="muted small" style="margin:0">Your mood and cravings will show here after your first check-in.</p>`
    : `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mood and craving over the last 14 days">
        <line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="var(--line)"/>${bars}${line}${dots}</svg>
       <div class="legend"><span><i style="background:var(--accent)"></i>Mood</span><span><i style="background:var(--danger);opacity:.55"></i>Craving</span></div>`;
}

function renderTopTriggers() {
  const top = topTriggers().slice(0, 5);
  const max = top[0]?.[1] || 1;
  $('#topTriggers').innerHTML = top.length
    ? top.map(([t, c]) => `<div style="margin-bottom:12px"><div class="entry-head"><span>${esc(t)}</span><span class="muted">${c}×</span></div><div class="progress"><div style="width:${c / max * 100}%;background:var(--danger);opacity:.7"></div></div></div>`).join('')
      + `<p class="small muted" style="margin:4px 0 0">Knowing your triggers lets you plan for them. Ask the coach for a plan.</p>`
    : `<p class="muted small" style="margin:0">Tag triggers in your check-ins to see patterns.</p>`;
}

function renderHistory() {
  const keys = Object.keys(journal).sort().reverse().slice(0, 30);
  $('#history').innerHTML = keys.length
    ? keys.map(k => {
        const e = journal[k];
        const d = new Date(k + 'T12:00');
        return `<div class="entry">
          <div class="entry-head"><span>${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          <span class="muted">${MOODS[e.mood - 1] || ''} · craving ${e.craving}/10</span></div>
          ${e.triggers?.length ? `<div class="small muted" style="margin-top:4px">${e.triggers.map(esc).join(', ')}</div>` : ''}
          ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
        </div>`;
      }).join('')
    : `<p class="muted small" style="margin:0">No check-ins yet.</p>`;
}

/* ---------- Coach (guided, free, works offline) ---------- */
const wait = ms => new Promise(r => setTimeout(r, ms));
const HALT_TIPS = {
  Hungry: 'Hunger feels a lot like a craving. Eat something real now, even something small like fruit, nuts or toast. Then check how strong the craving is.',
  Angry: 'Anger looks for a quick release. Move it out of your body: walk fast, do push-ups, squeeze something hard. Then write down what made you angry. You can deal with it once you\'re calm.',
  Lonely: 'Loneliness is one of the strongest triggers. Reach out to one person right now: a text, a call, a voice message. It doesn\'t have to be about quitting. Just connect.',
  Tired: 'When you\'re tired, your willpower is at its lowest. If you can, rest: lie down for 20 minutes or go to bed early. Don\'t make any big decisions tonight.',
};
const SLIP_TIPS = {
  Stress: 'Stress was the trigger. Next time stress builds, you need a different release ready: a walk, a breathing round in SOS, or a call to someone. Pick one now so it\'s ready.',
  'People or places': 'Being around it made it hard. For now, it\'s okay to avoid those people or places, or to go with a plan: arrive late, leave early, keep a drink or gum in your hand, and tell one person you\'re quitting.',
  Boredom: 'Boredom left a gap and the habit filled it. Plan the empty times: have a short list of things to do with your hands and your time, especially at the time of day it happened.',
  'A strong feeling': 'A strong feeling (sadness, anger, excitement) pushed you toward the old way of coping. Next time, name the feeling out loud and give it 10 minutes before doing anything.',
  'Tired or hungry': 'Being tired or hungry made you vulnerable. Protect your basics: regular meals and enough sleep make cravings much easier to handle.',
  'Not sure': 'That\'s okay. Check in with your journal for the next few days. Patterns usually show up, and then we can plan for them.',
};

function topTriggers() {
  const counts = {};
  Object.values(journal).forEach(e => (e.triggers || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function coachCtx() {
  const ms = elapsed();
  return {
    habit: habitLabel().toLowerCase(),
    days: Math.floor(ms / DAY),
    clean: formatDuration(ms),
    saved: money((profile.costPerDay || 0) * ms / DAY),
    hasMoney: (profile.costPerDay || 0) > 0,
    reasons: profile.reasons || [],
    topTrigger: topTriggers()[0]?.[0],
    risky: ['alcohol', 'drugs'].includes(profile.habit),
  };
}

// Each step returns what the coach says and what the person can tap next.
// A choice's target is a step id, or { to, arg }, { tab }, { url }, or { run }.
const COACH = {
  start: c => ({
    say: [
      c.days > 0 ? `Hi. You've been free from ${c.habit} for ${c.clean}.` : 'Hi. You\'re here, and that already counts.',
      'What\'s going on right now?',
    ],
    options: [
      ['I have a craving', 'craving'], ['I slipped', 'slipped'], ['I feel stressed', 'stressed'],
      ['I feel bored or lonely', 'lonely'], ['Help me plan for a trigger', 'plan'],
      ['Why is this so hard?', 'why'], ['I\'m doing well', 'well'], ['I don\'t feel safe', 'crisis'],
    ],
  }),

  craving: () => ({
    say: [
      'Okay. First: you don\'t have to act on this.',
      'A craving is like a wave. It rises, peaks and passes, usually within 10 to 20 minutes. Let\'s ride this one out together.',
    ],
    options: [
      ['Walk me through it', 'urge1'], ['Remind me why I quit', 'whyMe'],
      ['Breathe with me', { tab: 'sos' }], ['20-second light reset', { tab: 'light' }], ['Something else', 'start'],
    ],
  }),
  urge1: () => ({ say: ['Sit or stand still. Close your eyes if you can.', 'Where do you feel the craving in your body? Chest, throat, stomach, hands? Just notice it. Don\'t judge it.'], options: [['Next', 'urge2']] }),
  urge2: () => ({ say: ['From 1 to 10, how strong is it right now? Remember the number.'], options: [['Got it', 'urge3']] }),
  urge3: () => ({ say: ['Now breathe in slowly for 4… hold for 4… and out for 6.', 'Do that three times. Take your time.'], options: [['Done', 'urge4']] }),
  urge4: () => ({ say: ['Watch the feeling like a wave. Don\'t fight it and don\'t feed it.', 'Notice how it changes: tighter, looser, moving around. You are watching the craving. You are not the craving.'], options: [['Next', 'urge5']] }),
  urge5: () => ({ say: ['From 1 to 10, how strong is it now?'], options: [['Lower than before', 'urgeGood'], ['The same or stronger', 'urgeMore']] }),
  urgeGood: () => ({
    say: ['That\'s called urge surfing, and you just did it.', 'You proved a craving can pass without giving in. Every time you do this, the next one gets a little weaker.'],
    options: [['Log it in my journal', { tab: 'journal' }], ['Back to start', 'start']],
  }),
  urgeMore: () => ({
    say: ['That\'s okay. Some waves are big.', 'Change where you are right now: stand up, go to another room or outside, drink a glass of cold water. Moving your body breaks the loop.'],
    options: [['Remind me why I quit', 'whyMe'], ['Start a 10-minute timer', { tab: 'sos' }], ['Back to start', 'start']],
  }),
  whyMe: c => ({
    say: c.reasons.length
      ? ['You told me why you\'re doing this:', c.reasons.map(r => '• ' + r).join('\n'),
         ...(c.hasMoney && c.days > 0 ? [`You've also saved ${c.saved} so far.`] : []),
         'Is one moment worth giving that up?']
      : ['You haven\'t written your reasons yet. They help most in moments like this.', 'You can add them in Settings (the gear at the top).'],
    options: [['I can do this', 'strong'], ['Walk me through the craving', 'urge1'], ['Back to start', 'start']],
  }),
  strong: () => ({
    say: ['Yes, you can.', 'You don\'t have to be strong forever. Just get through the next 10 minutes.'],
    options: [['Start a 10-minute timer', { tab: 'sos' }], ['Back to start', 'start']],
  }),

  slipped: () => ({
    say: [
      'Thank you for being honest. A slip doesn\'t erase your progress.',
      'Most people who quit for good slipped along the way. What matters is what you do next, and you\'re already doing it.',
      'What was happening right before?',
    ],
    options: Object.keys(SLIP_TIPS).map(k => [k, { to: 'slipWhy', arg: k }]),
  }),
  slipWhy: (c, why) => ({
    say: [SLIP_TIPS[why], 'Now let\'s keep your record honest and start again right away. Not tomorrow. Now.'],
    options: [['Reset my counter', { run: confirmSlip }], ['Make a plan for next time', 'plan'], ['Back to start', 'start']],
  }),

  stressed: () => ({
    say: ['Let\'s check the basics. Cravings get much louder when you\'re Hungry, Angry, Lonely or Tired.', 'Which one fits right now?'],
    options: [...Object.keys(HALT_TIPS).map(k => [k, { to: 'halt', arg: k }]), ['None of them', 'stressOther']],
  }),
  halt: (c, k) => ({ say: [HALT_TIPS[k]], options: [['That helps', 'start'], ['I still have a craving', 'craving']] }),
  stressOther: () => ({
    say: ['Then let\'s calm your body first. Your mind follows your body.', 'Try one round of slow breathing, or a 20-second light reset with your eyes closed.'],
    options: [['Breathe with me', { tab: 'sos' }], ['Light reset', { tab: 'light' }], ['Back to start', 'start']],
  }),

  lonely: () => ({
    say: [
      'Boredom and loneliness are two of the biggest triggers. The habit used to fill that empty space.',
      'Fill it on purpose instead:\n• Message one person, any person\n• Go somewhere with people around: a café, a park, a gym\n• Do something with your hands: cook, clean, draw, fix something\n• Learn one small new thing today',
    ],
    options: [['Give me a quick idea', { tab: 'sos' }], ['I have a craving too', 'craving'], ['Back to start', 'start']],
  }),

  plan: c => ({
    say: [
      'Let\'s make an if-then plan. Deciding ahead of time what you\'ll do makes it much easier when the moment comes.',
      ...(c.topTrigger ? [`Your journal says your most common trigger is "${c.topTrigger}".`] : []),
      'Which trigger do you want to plan for?',
    ],
    options: [...new Set([c.topTrigger, 'Stress', 'Boredom', 'Lonely', 'Friends', 'Party', 'Bedtime', 'Phone'].filter(Boolean))]
      .map(t => [t, { to: 'planAction', arg: t }]),
  }),
  planAction: (c, t) => ({
    say: [`When "${t}" happens, what will you do instead?`, 'Keep it small and specific, like "go for a 5-minute walk" or "text my brother".'],
    input: {
      placeholder: 'I will…',
      save: text => {
        profile.plans = [...(profile.plans || []), { trigger: t, action: text.replace(/^i will\s*/i, '') }].slice(-10);
        saveProfile();
      },
      next: 'planSaved',
    },
  }),
  planSaved: () => ({
    say: ['Saved. Your plans show at the top of this screen whenever you need them.', 'Say it to yourself once now, so it\'s ready when you need it.'],
    options: [['Make another plan', 'plan'], ['Back to start', 'start']],
  }),

  why: c => ({
    say: [
      'Because your brain learned it. Every time you used, your brain got a big rush of dopamine, the chemical behind wanting.',
      'Over time it turned down its own sensitivity, so everyday things started to feel flat and the habit felt like the only relief.',
      'When you stop, your brain needs time to rebalance. The first days are often the hardest. For most people, cravings slowly get weaker and less frequent over the following weeks.',
      'So when it feels hard, that\'s your brain healing. It\'s not you failing.',
      ...(c.risky ? ['Important: stopping alcohol or some drugs suddenly after heavy use can be dangerous. Please talk to a doctor about safe withdrawal.'] : []),
    ],
    options: [['That helps', 'start'], ['I have a craving now', 'craving']],
  }),

  well: c => ({
    say: [
      c.days > 0 ? `That's great to hear. ${c.clean} free${c.hasMoney ? `, and ${c.saved} saved` : ''}.` : 'That\'s great to hear.',
      'Good days are the best time to help your future self. Write one sentence to read on a hard day.',
    ],
    input: {
      placeholder: 'On a hard day, remember…',
      save: text => { profile.reasons = [...(profile.reasons || []), text].slice(-12); saveProfile(); },
      next: 'wellSaved',
    },
  }),
  wellSaved: () => ({
    say: ['Added to your reasons. You\'ll see it on Home, in SOS, and here when a craving hits.'],
    options: [['Back to start', 'start']],
  }),

  crisis: () => ({
    say: [
      'I\'m really glad you said something. Your safety matters more than anything else here.',
      'If you\'re in danger right now, or you\'ve taken too much of something, call your local emergency number now (112 in Europe and Turkey, 911 in the US).',
      'You can also talk to a real person at a crisis line. It\'s free and confidential.',
    ],
    options: [['Find a helpline near me', { url: HELPLINE_URL }], ['Back to start', 'start']],
  }),
};

let coachRun = 0;
function renderCoach() {
  const plans = profile.plans || [];
  $('#view').innerHTML = `
    <h1>Coach</h1>
    <p class="muted">Tap what's going on and I'll guide you through it. Free, private, and it works offline.</p>
    ${plans.length ? `<div class="card plans">
      <div class="small muted" style="margin-bottom:6px">Your if-then plans</div>
      ${plans.map((p, i) => `<div class="plan"><span>When <b>${esc(p.trigger.toLowerCase())}</b> hits, I will ${esc(p.action)}.</span><button class="link" data-del="${i}" aria-label="Remove plan">✕</button></div>`).join('')}
    </div>` : ''}
    <div class="chat" id="chat"></div>
    <div class="choices" id="choices"></div>`;
  $$('[data-del]').forEach(b => b.addEventListener('click', () => {
    profile.plans.splice(+b.dataset.del, 1); saveProfile(); renderCoach();
  }));
  coachStep('start');
}

function addBubble(role, text) {
  const el = document.createElement('div');
  el.className = `bubble ${role}`;
  el.textContent = text;
  $('#chat').appendChild(el);
  return el;
}
const scrollChat = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

async function coachStep(id, arg) {
  const run = ++coachRun;
  const node = COACH[id](coachCtx(), arg);
  const choices = $('#choices');
  if (!choices) return;
  choices.innerHTML = '';
  for (const line of node.say) {
    const b = addBubble('assistant', '•••');
    b.classList.add('typing');
    scrollChat();
    await wait(Math.min(1100, 350 + line.length * 6));
    if (run !== coachRun || !b.isConnected) return;
    b.classList.remove('typing');
    b.textContent = line;
  }

  if (node.input) {
    choices.innerHTML = `<form class="coach-input"><input type="text" maxlength="200" placeholder="${esc(node.input.placeholder)}"><button class="btn primary">Save</button></form>`;
    const form = $('form', choices), input = $('input', form);
    input.focus();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return flash(input);
      addBubble('user', text);
      node.input.save(text);
      coachStep(node.input.next);
    });
  } else {
    choices.innerHTML = node.options.map((o, i) => `<button class="choice" data-i="${i}">${esc(o[0])}</button>`).join('');
    $$('.choice', choices).forEach(btn => btn.addEventListener('click', () => {
      const [label, target] = node.options[+btn.dataset.i];
      if (typeof target === 'string') { addBubble('user', label); return coachStep(target); }
      if (target.to) { addBubble('user', label); return coachStep(target.to, target.arg); }
      if (target.tab) return go(target.tab);
      if (target.url) return window.open(target.url, '_blank', 'noopener');
      if (target.run) return target.run();
    }));
  }
  scrollChat();
}

/* ---------- Settings ---------- */
function renderSettings() {
  $$('#tabbar button').forEach(b => b.classList.remove('active'));
  const state = { habit: profile.habit };
  $('#view').innerHTML = `
    <h1>Settings</h1>
    <div style="height:12px"></div>
    <div id="pf">${profileForm(profile)}</div>
    <button class="btn primary" id="saveProfile">Save changes</button>

    <h2>Light reset</h2>
    <div class="card">
      <label style="display:flex;justify-content:space-between;align-items:center">
        <span>Enable light reset</span>
        <input type="checkbox" id="lightOn" ${profile.lightEnabled !== false ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)">
      </label>
    </div>

    <h2>Your data</h2>
    <div class="stack">
      <button class="btn" id="export">Export my data</button>
      <button class="btn subtle-danger" id="wipe">Delete everything</button>
    </div>
    <p class="small muted center" style="margin-top:24px">Be Clean keeps your data on this device only. Nothing is sent anywhere.</p>`;

  const pf = $('#pf');
  bindProfileForm(pf, state);
  $('#saveProfile').addEventListener('click', () => {
    Object.assign(profile, readProfileForm(pf, state));
    saveProfile();
    $('#saveProfile').textContent = 'Saved ✓';
    setTimeout(() => { const b = $('#saveProfile'); if (b) b.textContent = 'Save changes'; }, 1200);
  });
  $('#lightOn').addEventListener('change', e => { profile.lightEnabled = e.target.checked; saveProfile(); });
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ profile, journal }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `be-clean-${dateKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#wipe').addEventListener('click', () => openModal(`
    <h1 style="font-size:22px">Delete everything?</h1>
    <p class="muted">Your streak, journal and plans will be erased from this phone. This can't be undone.</p>
    <div class="stack"><button class="btn danger" id="yesWipe">Delete everything</button><button class="btn ghost" id="noWipe">Cancel</button></div>`, s => {
    $('#noWipe', s).onclick = closeModal;
    $('#yesWipe', s).onclick = () => { store.clear(); location.reload(); };
  }));
}

/* ---------- Boot ---------- */
start();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
