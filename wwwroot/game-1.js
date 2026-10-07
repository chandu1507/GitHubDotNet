// ============================== CONSTANTS ==============================
const FW = 600, FL = 960;                       // field width (x) and length (y)
const GOAL_W = 200, GX0 = (FW - GOAL_W) / 2, GX1 = (FW + GOAL_W) / 2;
const BALL_R = 9, FIG_W = 24, FIG_D = 12, REACH = 14;
const BLOCK_MIN = -55, BLOCK_MAX = 70;          // angle window where feet touch the ball
const TRAP_MIN = 20, TRAP_MAX = 65;             // forward tilt window that traps
const KICK_OUT = 0.06, KICK_BACK = 0.11, KICK_PEAK = 125, KICK_POWER = 1000;
const SLIDE_MIN = 200, SLIDE_MAX = 640, ANG_RATE = 380;
const FRICTION = 0.35, E_WALL = 0.82, E_FIG = 0.5, TRAP_SPEED = 320, PIN_MAX = 10, MAX_SPEED = 1500;
const GOAL_PAUSE = 1.8, REPLAY_SPEED = 0.5, DEAD_T = 3, STEP = 1 / 120, D2R = Math.PI / 180;
const BORDER = 26, HANDLE = 70;

const TEAM = {
  A: { name: 'Team A', color: '#3b82f6', light: '#93c5fd', dark: '#1e3a8a', dir: -1 },
  B: { name: 'Team B', color: '#ef4444', light: '#fca5a5', dark: '#7f1d1d', dir: 1 }
};
const ROD_DEFS = [
  { team: 'B', role: 'goalie',   y: 60,  n: 1, sp: 0 },
  { team: 'B', role: 'defense',  y: 170, n: 2, sp: 240 },
  { team: 'A', role: 'attack',   y: 290, n: 3, sp: 190 },
  { team: 'B', role: 'midfield', y: 455, n: 5, sp: 115 },
  { team: 'A', role: 'midfield', y: 505, n: 5, sp: 115 },
  { team: 'B', role: 'attack',   y: 670, n: 3, sp: 190 },
  { team: 'A', role: 'defense',  y: 790, n: 2, sp: 240 },
  { team: 'A', role: 'goalie',   y: 900, n: 1, sp: 0 }
];
const ORDER = ['goalie', 'defense', 'midfield', 'attack'];
const KEYMAP = {
  P1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', kick: 'KeyE', sw: 'KeyQ' },
  P2: { left: 'KeyJ', right: 'KeyL', up: 'KeyI', down: 'KeyK', kick: 'Space', sw: 'KeyU' },
  P3: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', kick: 'Enter', sw: 'ShiftRight' },
  P4: { left: 'Numpad4', right: 'Numpad6', up: 'Numpad8', down: 'Numpad5', kick: 'Numpad0', sw: 'NumpadAdd' }
};
const SEAT_IDS = ['P1', 'P2', 'P3', 'P4'];
const SEAT_TEAM = { P1: 'A', P2: 'A', P3: 'B', P4: 'B' };
const BOT = {
  easy:   { spd: 0.5,  react: 0.28, err: 34, kick: 0.5 },
  normal: { spd: 0.78, react: 0.14, err: 16, kick: 0.8 },
  hard:   { spd: 1.0,  react: 0.06, err: 6,  kick: 0.97 }
};
const GOAL_LINES = ['GOAL!', 'WHAT A STRIKE!', 'TOP BINS!', 'GOOOAL!', 'UNSTOPPABLE!'];
const OWN_LINES = ['{n}, wrong way!', '{n} has switched teams?', 'Thanks for the help, {n}!', '{n} will hear about this at standup'];

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function keyLabel(code) {
  const m = { Space: 'Space', Enter: 'Enter', ShiftRight: 'R-Shift', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', NumpadAdd: 'Num +' };
  if (m[code]) return m[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
function loadJSON(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

let AC = null, soundOn = true, lastSfx = {};
function initAudio() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} }
function sfx(type) {
  if (!soundOn || !AC) return;
  const now = performance.now();
  if ((type === 'wall' || type === 'hit') && now - (lastSfx[type] || 0) < 60) return;
  lastSfx[type] = now;
  try {
    const t = AC.currentTime;
    const tone = (f, d, wave, vol, at = 0, f2) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = wave; o.frequency.setValueAtTime(f, t + at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + d);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g); g.connect(AC.destination); o.start(t + at); o.stop(t + at + d + 0.02);
    };
    switch (type) {
      case 'kick': tone(180, 0.08, 'square', 0.14, 0, 90); break;
      case 'hit': tone(320, 0.04, 'triangle', 0.07); break;
      case 'wall': tone(140, 0.03, 'sine', 0.06); break;
      case 'goal': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.1, i * 0.09)); break;
      case 'own': [392, 370, 349, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.08, i * 0.22)); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, i * 0.12)); break;
      case 'serve': tone(880, 0.08, 'sine', 0.08); break;
      case 'speed': tone(440, 0.15, 'sawtooth', 0.06, 0, 880); break;
      case 'trap': tone(260, 0.06, 'sine', 0.08); break;
    }
  } catch (e) {}
}

const G = {
  state: 'menu', paused: false, debug: false, mode: '1v1',
  rods: [], seats: [], ball: { x: FW / 2, y: FL / 2, vx: 0, vy: 0, pin: null },
  score: { A: 0, B: 0 }, target: 5, bot: BOT.normal, auto: true,
  lastTouch: null, touches: 0, mult: 1, lastTouchT: -1, simT: 0, stillT: 0, timer: 0,
  rec: [], replay: null, banner: null, toasts: [], particles: [], shake: 0, serveSide: 1,
  stats: {}, winner: null, goalT: 0, acc: 0, fps: 60
};
const keys = new Set();

function makeRods() {
  return ROD_DEFS.map((d, idx) => {
    const half = (d.n - 1) / 2 * d.sp;
    let min, max;
    if (d.role === 'goalie') { min = GX0 - 6; max = GX1 + 6; }
    else { min = 4 + half + FIG_W / 2; max = FW - 4 - half - FIG_W / 2; }
    return Object.assign({ idx, dir: TEAM[d.team].dir, half, min, max, c: FW / 2, lastC: FW / 2, vx: 0, ang: 0,
      kick: null, kickHit: false, hold: 0, trapCd: 0, owner: null, bt: 0, btc: FW / 2 }, d);
  });
}
const rodIdx = (team, role) => ROD_DEFS.findIndex(d => d.team === team && d.role === role);
const figX = (r, i, c = r.c) => c + (i - (r.n - 1) / 2) * r.sp;
function rodAngle(r) {
  if (!r.kick) return r.ang;
  const k = r.kick;
  if (k.t < KICK_OUT) return k.base + (KICK_PEAK - k.base) * (k.t / KICK_OUT);
  const u = Math.min(1, (k.t - KICK_OUT) / KICK_BACK);
  return KICK_PEAK + (k.base - KICK_PEAK) * u;
}
const footY = (r, ang) => r.y + r.dir * Math.sin(ang * D2R) * REACH;
const blocks = ang => ang > BLOCK_MIN && ang < BLOCK_MAX;
const seatById = id => G.seats.find(s => s.id === id);
const seatName = id => { const s = seatById(id); return s ? s.name : id; };
const stat = id => (G.stats[id] = G.stats[id] || { g: 0, og: 0 });

function newMatch(cfg) {
  G.mode = cfg.mode; G.target = +cfg.target; G.bot = BOT[cfg.level] || BOT.normal; G.auto = cfg.auto;
  soundOn = cfg.sound;
  G.rods = makeRods();
  const assign = G.mode === '1v1'
    ? { P1: ORDER.map(r => rodIdx('A', r)), P3: ORDER.map(r => rodIdx('B', r)) }
    : { P1: [rodIdx('A', 'goalie'), rodIdx('A', 'defense')], P2: [rodIdx('A', 'midfield'), rodIdx('A', 'attack')],
        P3: [rodIdx('B', 'goalie'), rodIdx('B', 'defense')], P4: [rodIdx('B', 'midfield'), rodIdx('B', 'attack')] };
  G.seats = Object.keys(assign).map(id => {
    const sc = cfg.seats[id];
    const type = sc.type;
    const name = (sc.name || '').trim() || (type === 'bot' ? 'Bot ' + id : type === 'idle' ? 'Dummy ' + id : id);
    const s = { id, team: SEAT_TEAM[id], name, type, rods: assign[id], sel: G.mode === '1v1' ? 2 : 0, manualT: 0, km: KEYMAP[id] };
    s.rods.forEach(ri => G.rods[ri].owner = id);
    return s;
  });
  G.score = { A: 0, B: 0 }; G.stats = {}; G.winner = null; G.rec = []; G.replay = null;
  G.particles = []; G.toasts = []; G.banner = null; G.paused = false; G.simT = 0;
  serve();
}

function serve() {
  const b = G.ball;
  G.serveSide *= -1;
  b.x = G.serveSide > 0 ? BALL_R + 2 : FW - BALL_R - 2;
  b.y = FL / 2 + (Math.random() * 2 - 1) * 8;
  b.vx = b.vy = 0; b.pin = null;
  G.touches = 0; G.mult = 1; G.lastTouch = null; G.lastKick = null; G.stillT = 0;
  G.rods.forEach(r => { r.kick = null; r.trapCd = 0; });
  G.state = 'ready'; G.timer = 1.1; G.replay = null;
}
function launchServe() {
  const b = G.ball;
  b.vx = (b.x < FW / 2 ? 1 : -1) * (240 + Math.random() * 140);
  b.vy = (Math.random() * 2 - 1) * 50;
  G.state = 'play'; sfx('serve');
}

function startKick(r) {
  if (r.kick && r.kick.t < KICK_OUT + KICK_BACK * 0.5) return;
  const base = r.ang;
  r.kick = { t: 0, base, windup: base < -30 };
  r.kickHit = false;
  const b = G.ball;
  if (b.pin && b.pin.rod === r.idx && G.state === 'play') {
    const fx = figX(r, b.pin.i);
    applyKick(r, fx, 1.25);
    r.kickHit = true;
    toast('PIN SHOT!');
  }
}
function controlRods(h) {
  const live = G.state === 'play' || G.state === 'ready';
  for (const s of G.seats) {
    if (s.type === 'human') {
      if (G.auto && G.state === 'play') autoSelect(s, h);
      const r = G.rods[s.rods[s.sel]], k = s.km;
      const mv = (keys.has(k.right) ? 1 : 0) - (keys.has(k.left) ? 1 : 0);
      if (mv) { r.hold += h; r.c += mv * (SLIDE_MIN + (SLIDE_MAX - SLIDE_MIN) * Math.min(1, r.hold / 0.25)) * h; }
      else r.hold = 0;
      const tilt = (keys.has(k.up) ? 1 : 0) - (keys.has(k.down) ? 1 : 0);
      if (tilt) r.ang = clamp(r.ang + tilt * (-r.dir) * ANG_RATE * h, -90, 90);
    } else if (s.type === 'bot' && live) {
      for (const ri of s.rods) botRod(G.rods[ri], h);
    }
  }
  for (const r of G.rods) {
    r.c = clamp(r.c, r.min, r.max);
    r.vx = (r.c - r.lastC) / h; r.lastC = r.c;
    if (r.kick) { r.kick.t += h; if (r.kick.t > KICK_OUT + KICK_BACK) r.kick = null; }
    if (r.trapCd > 0) r.trapCd -= h;
  }
}
function autoSelect(s, h) {
  if (s.manualT > 0) { s.manualT -= h; return; }
  const b = G.ball;
  const cost = ri => { const r = G.rods[ri]; const rel = (b.y - r.y) * r.dir; return Math.abs(b.y - r.y) + (rel < -30 ? 120 : 0); };
  let best = s.sel, bc = cost(s.rods[s.sel]);
  s.rods.forEach((ri, i) => { const c = cost(ri); if (c < bc - 25) { bc = c; best = i; } });
  s.sel = best;
}
function predictX(y) {
  const b = G.ball;
  let x = b.x;
  if (Math.abs(b.vy) > 30) {
    const t = (y - b.y) / b.vy;
    if (t > 0 && t < 1.5) {
      x = b.x + b.vx * t;
      const w = FW - 2 * BALL_R, p = 2 * w;
      const u = (((x - BALL_R) % p) + p) % p;
      x = u <= w ? BALL_R + u : BALL_R + p - u;
    }
  }
  return x;
}
function botRod(r, h) {
  const p = G.bot, b = G.ball;
  r.bt -= h;
  if (r.bt <= 0) {
    r.bt = p.react * (0.7 + Math.random() * 0.6);
    const tx = predictX(r.y) + (Math.random() * 2 - 1) * p.err;
    let best = r.c, bc = Infinity;
    for (let i = 0; i < r.n; i++) {
      const off = (i - (r.n - 1) / 2) * r.sp, c = clamp(tx - off, r.min, r.max);
      const cost = Math.abs(c + off - tx) * 3 + Math.abs(c - r.c) * 0.2;
      if (cost < bc) { bc = cost; best = c; }
    }
    r.btc = best;
  }
  const d = r.btc - r.c, mx = SLIDE_MAX * p.spd * h;
  r.c += Math.abs(d) < mx ? d : Math.sign(d) * mx;
  const rel = (b.y - r.y) * r.dir;
  let target = 0;
  if (r.role !== 'goalie' && rel < -(BALL_R + FIG_D) && b.vy * r.dir > 60 && G.lastTouch && G.lastTouch.team === r.team) target = -85;
  r.ang += clamp(target - r.ang, -ANG_RATE * h, ANG_RATE * h);
  if (!r.kick && G.state === 'play' && rel > 0 && rel < FIG_D / 2 + BALL_R + REACH + 4) {
    for (let i = 0; i < r.n; i++) {
      if (Math.abs(b.x - figX(r, i)) < FIG_W / 2 + BALL_R - 2 && Math.random() < p.kick * h * 12) { startKick(r); break; }
    }
  }
}
