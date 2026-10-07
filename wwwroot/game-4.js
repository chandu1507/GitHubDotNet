// ============================== MENU ==============================
const DEFAULT_CFG = { mode: '1v1', target: 5, level: 'normal', auto: true, sound: true,
  seats: { P1: { name: '', type: 'human' }, P2: { name: '', type: 'human' }, P3: { name: '', type: 'bot' }, P4: { name: '', type: 'bot' } } };
let cfg = Object.assign({}, DEFAULT_CFG, loadJSON('foosball.cfg.v1', {}));
cfg.seats = Object.assign({}, DEFAULT_CFG.seats, cfg.seats || {});

function seatActive(id, mode) { return mode === '2v2' || id === 'P1' || id === 'P3'; }
function keysHtml(id, mode) {
  const k = KEYMAP[id], K = c => `<kbd>${keyLabel(c)}</kbd>`;
  let s = `${K(k.left)}${K(k.right)} slide · ${K(k.up)}${K(k.down)} tilt · ${K(k.kick)} kick · ${K(k.sw)} switch rod`;
  if (mode === '1v1' && id === 'P1') s += ` · also ${K('Space')} kick, <kbd>1</kbd>–<kbd>4</kbd> pick rod`;
  if (mode === '1v1' && id === 'P3') s += ` · also <kbd>Num Enter</kbd> kick, <kbd>Num 1</kbd>–<kbd>4</kbd> pick rod`;
  return s;
}
function syncSeatsFromDom() {
  for (const id of SEAT_IDS) {
    const n = $('name-' + id), t = $('type-' + id);
    if (n) cfg.seats[id].name = n.value;
    if (t) cfg.seats[id].type = t.value;
  }
}
function buildMenu() {
  document.querySelectorAll('input[name=mode]').forEach(r => r.checked = r.value === cfg.mode);
  const rods = (id) => cfg.mode === '1v1' ? 'All 4 rods' : (id === 'P1' || id === 'P3' ? 'Goalie + Defense' : 'Midfield + Attack');
  const tb = $('seatRows'); tb.innerHTML = '';
  for (const id of SEAT_IDS) {
    if (!seatActive(id, cfg.mode)) continue;
    const t = SEAT_TEAM[id], sc = cfg.seats[id], tr = document.createElement('tr');
    tr.innerHTML = `<td><b>${id}</b></td><td class="team${t}">Team ${t} ${t === 'A' ? '(bottom)' : '(top)'}</td><td>${rods(id)}</td>
      <td><input type="text" id="name-${id}" maxlength="14" placeholder="${id}" value="${esc(sc.name)}"></td>
      <td><select id="type-${id}"><option value="human">Human</option><option value="bot">Bot</option><option value="idle">Idle dummy</option></select></td>
      <td class="keys">${keysHtml(id, cfg.mode)}</td>`;
    tb.appendChild(tr);
    $('type-' + id).value = sc.type;
  }
  $('target').value = String(cfg.target); $('level').value = cfg.level; $('auto').checked = cfg.auto; $('sound').checked = cfg.sound;
  buildLeaderboard();
}
function buildLeaderboard() {
  const lb = loadJSON('foosball.lb.v1', {});
  const rows = Object.entries(lb).sort((a, b) => b[1].w - a[1].w || (b[1].g - b[1].og) - (a[1].g - a[1].og));
  $('lbRows').innerHTML = rows.length ? rows.map(([n, e], i) =>
    `<tr><td>${i + 1}${i === 0 ? ' 👑' : ''}</td><td>${esc(n)}</td><td>${e.w}</td><td>${e.l}</td><td>${e.g}</td><td>${e.og}</td><td>${e.p}</td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">No matches yet.</td></tr>';
}
function readCfg() {
  if (G.state === 'menu') {
    syncSeatsFromDom();
    cfg.target = +$('target').value; cfg.level = $('level').value; cfg.auto = $('auto').checked; cfg.sound = $('sound').checked;
    saveJSON('foosball.cfg.v1', cfg);
  }
  return cfg;
}
function startFromMenu() {
  readCfg(); initAudio();
  if (document.activeElement) document.activeElement.blur();
  $('menu').classList.add('hidden');
  layout(); newMatch(cfg);
}
function showMenu() { G.state = 'menu'; G.paused = false; keys.clear(); $('menu').classList.remove('hidden'); buildMenu(); }

const PRESETS = {
  solo:     { mode: '1v1', types: { P1: 'human', P3: 'bot' } },
  practice: { mode: '1v1', types: { P1: 'human', P3: 'idle' } },
  duel:     { mode: '1v1', types: { P1: 'human', P3: 'human' } },
  '2v2':    { mode: '2v2', types: { P1: 'human', P2: 'human', P3: 'human', P4: 'human' } },
  watch:    { mode: '1v1', types: { P1: 'bot', P3: 'bot' } }
};
document.querySelectorAll('[data-preset]').forEach(btn => btn.addEventListener('click', () => {
  syncSeatsFromDom();
  const p = PRESETS[btn.dataset.preset];
  cfg.mode = p.mode;
  for (const id in p.types) cfg.seats[id].type = p.types[id];
  buildMenu();
}));
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { syncSeatsFromDom(); cfg.mode = r.value; buildMenu(); }));
$('start').addEventListener('click', startFromMenu);
$('lbReset').addEventListener('click', () => { if (confirm('Reset the leaderboard?')) { saveJSON('foosball.lb.v1', {}); buildLeaderboard(); } });

layout(); buildMenu(); requestAnimationFrame(frame);
