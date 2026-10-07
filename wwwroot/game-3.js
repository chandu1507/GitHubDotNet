// ============================== LOOP ==============================
function fixedStep(h) {
  G.simT += h;
  const st = G.state;
  if (st === 'play' || st === 'ready' || st === 'goal') controlRods(h);
  if (st === 'ready') { G.timer -= h; if (G.timer <= 0) launchServe(); }
  else if (st === 'play') physics(h);
  else if (st === 'goal') { G.timer -= h; if (G.timer <= 0) startReplay(); }
  else if (st === 'replay') { G.replay.t += h * REPLAY_SPEED; if (G.replay.t >= G.replay.end) endReplay(); }
  if (G.state === 'play' || G.state === 'goal') record();
}
let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0); lastTs = ts;
  if (dt > 0) G.fps = G.fps * 0.95 + (1 / dt) * 0.05;
  if (G.state !== 'menu' && !G.paused) {
    G.acc += dt;
    while (G.acc >= STEP) { fixedStep(STEP); G.acc -= STEP; }
    updateFx(dt);
  }
  render();
  requestAnimationFrame(frame);
}

const GAME_CODES = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Enter', 'Tab', 'Backquote', 'Escape', 'NumpadEnter']);
Object.values(KEYMAP).forEach(k => Object.values(k).forEach(c => GAME_CODES.add(c)));
window.addEventListener('keydown', e => {
  if (G.state === 'menu') { if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') startFromMenu(); return; }
  if (GAME_CODES.has(e.code) || e.code.startsWith('Numpad') || e.code.startsWith('Digit')) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Escape') { if (G.state === 'over') showMenu(); else G.paused = !G.paused; return; }
  if (G.paused) { if (e.code === 'KeyM') showMenu(); return; }
  if (G.state === 'over') { if (e.code === 'KeyR') newMatch(readCfg()); if (e.code === 'KeyM') showMenu(); return; }
  if (e.code === 'Backquote') { G.debug = !G.debug; return; }
  if (e.code === 'Backspace') { if (G.state === 'replay') endReplay(); else if (G.state === 'play') { toast('Re-serve'); serve(); } return; }
  for (const s of G.seats) {
    if (s.type !== 'human') continue;
    const k = s.km, r = G.rods[s.rods[s.sel]];
    const extraKick = G.mode === '1v1' && ((s.id === 'P1' && e.code === 'Space') || (s.id === 'P3' && e.code === 'NumpadEnter'));
    if ((e.code === k.kick || extraKick) && (G.state === 'play' || G.state === 'ready')) startKick(r);
    if (e.code === k.sw) { s.sel = (s.sel + 1) % s.rods.length; s.manualT = 1.5; }
    if (G.mode === '1v1') {
      const m = s.id === 'P1' ? /^Digit([1-4])$/.exec(e.code) : /^Numpad([1-4])$/.exec(e.code);
      if (m) { s.sel = +m[1] - 1; s.manualT = 1.5; }
    }
  }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const cv = $('cv'), ctx = cv.getContext('2d');
let S = 1, OX = 0, OY = 0, DPR = 1, VW = 0, VH = 0;
function layout() {
  DPR = window.devicePixelRatio || 1; VW = window.innerWidth; VH = window.innerHeight;
  cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  S = Math.min(VW / (FW + 2 * (BORDER + HANDLE) + 40), VH / (FL + 2 * BORDER + 90));
  OX = (VW - FW * S) / 2; OY = (VH - FL * S) / 2;
}
window.addEventListener('resize', layout);

function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function drawTable(view) {
  ctx.fillStyle = '#5b3a1e'; rr(-BORDER, -BORDER, FW + 2 * BORDER, FL + 2 * BORDER, 14); ctx.fill();
  ctx.fillStyle = '#7a4f2a'; rr(-BORDER + 5, -BORDER + 5, FW + 2 * BORDER - 10, FL + 2 * BORDER - 10, 10); ctx.fill();
  for (const [y0, team] of [[-BORDER, 'B'], [FL, 'A']]) {
    ctx.fillStyle = '#0a0f1a'; ctx.fillRect(GX0, y0, GOAL_W, BORDER);
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = 1;
    for (let x = GX0 + 10; x < GX1; x += 10) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + BORDER); ctx.stroke(); }
    ctx.fillStyle = TEAM[team].color; ctx.fillRect(GX0 - 6, team === 'B' ? -4 : FL, 6, 4); ctx.fillRect(GX1, team === 'B' ? -4 : FL, 6, 4);
  }
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#1f7a3a' : '#22863f'; ctx.fillRect(0, i * FL / 12, FW, FL / 12 + 1); }
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, FW - 3, FL - 3);
  ctx.beginPath(); ctx.moveTo(0, FL / 2); ctx.lineTo(FW, FL / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(FW / 2, FL / 2, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(GX0 - 40, 0, GOAL_W + 80, 80); ctx.strokeRect(GX0 - 40, FL - 80, GOAL_W + 80, 80);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.font = 'bold 40px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('OFFICE CUP', FW / 2, FL / 2 + 120);

  for (const s of G.seats) {
    if (s.type !== 'human') continue;
    const r = G.rods[s.rods[s.sel]];
    ctx.fillStyle = TEAM[s.team].color; ctx.globalAlpha = 0.16; ctx.fillRect(0, r.y - 22, FW, 44); ctx.globalAlpha = 1;
  }
  for (const r of G.rods) {
    const st = view.rods[r.idx], c = st[0], ang = st[1], T = TEAM[r.team];
    const handleLeft = r.team === 'B';
    ctx.strokeStyle = '#c0c7d1'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-BORDER - 40, r.y); ctx.lineTo(FW + BORDER + 40, r.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-BORDER - 40, r.y + 2.5); ctx.lineTo(FW + BORDER + 40, r.y + 2.5); ctx.stroke();
    const hx = handleLeft ? -BORDER - 70 : FW + BORDER + 40;
    ctx.fillStyle = T.dark; rr(hx, r.y - 9, 30, 18, 6); ctx.fill();
    const s = seatById(r.owner), sel = s && s.type === 'human' && s.rods[s.sel] === r.idx;
    ctx.font = (sel ? 'bold ' : '') + '15px Segoe UI'; ctx.textBaseline = 'middle';
    ctx.textAlign = handleLeft ? 'right' : 'left';
    ctx.fillStyle = sel ? '#ffffff' : T.light;
    const lx = handleLeft ? hx - 8 : hx + 38;
    ctx.fillText((sel && handleLeft ? '▶ ' : '') + (s ? s.name : '') + (sel && !handleLeft ? ' ◀' : ''), lx, r.y - 7);
    ctx.font = '11px Segoe UI'; ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText(r.role, lx, r.y + 9);

    const blk = blocks(ang), fy = r.y + r.dir * Math.sin(ang * D2R) * REACH;
    const trap = ang >= TRAP_MIN && ang <= TRAP_MAX && !(r.kick);
    for (let i = 0; i < r.n; i++) {
      const fx = figX(r, i, c);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(fx - FIG_W / 2 + 3, fy - FIG_D / 2 + 3, FIG_W, FIG_D, 3); ctx.fill();
      ctx.strokeStyle = T.dark; ctx.lineWidth = 6; ctx.globalAlpha = blk ? 1 : 0.4;
      ctx.beginPath(); ctx.moveTo(fx, r.y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = T.color; rr(fx - FIG_W / 2, fy - FIG_D / 2, FIG_W, FIG_D, 3); ctx.fill();
      if (trap) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; rr(fx - FIG_W / 2, fy - FIG_D / 2, FIG_W, FIG_D, 3); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = T.dark; ctx.beginPath(); ctx.arc(fx, r.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (G.debug && blk) { ctx.strokeStyle = '#0ff'; ctx.lineWidth = 1; ctx.strokeRect(fx - FIG_W / 2, fy - FIG_D / 2, FIG_W, FIG_D); }
    }
    if (G.debug) { ctx.fillStyle = '#0ff'; ctx.font = '11px Consolas'; ctx.textAlign = 'left'; ctx.fillText(Math.round(ang) + '°', 4, r.y - 14); }
  }
  const bx = view.bx, by = view.by;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(bx + 3, by + 4, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
  if (G.ball.pin && !view.replay) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, BALL_R + 4, 0, Math.PI * 2); ctx.stroke(); }
}
function txt(s, x, y, size, color, align = 'center', weight = 'bold', stroke = true) {
  ctx.font = `${weight} ${size}px Segoe UI`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function drawHud() {
  const u = Math.max(0.75, Math.min(1.4, S));
  const namesOf = t => G.seats.filter(s => s.team === t).map(s => s.name).join(' & ');
  txt(TEAM.B.name.toUpperCase() + ' · ' + namesOf('B'), VW / 2, OY - (BORDER + 22) * S, 20 * u, TEAM.B.light);
  txt(TEAM.A.name.toUpperCase() + ' · ' + namesOf('A'), VW / 2, OY + (FL + BORDER + 22) * S, 20 * u, TEAM.A.light);
  const lx = Math.max(16, OX - (BORDER + HANDLE + 40) * S - 190 * u);
  ctx.fillStyle = 'rgba(15,23,42,.85)'; rr(lx, VH / 2 - 120 * u, 170 * u, 240 * u, 14); ctx.fill();
  txt('B', lx + 35 * u, VH / 2 - 65 * u, 28 * u, TEAM.B.color);
  txt(String(G.score.B), lx + 110 * u, VH / 2 - 65 * u, 64 * u, '#fff');
  txt('A', lx + 35 * u, VH / 2 + 65 * u, 28 * u, TEAM.A.color);
  txt(String(G.score.A), lx + 110 * u, VH / 2 + 65 * u, 64 * u, '#fff');
  txt('first to ' + G.target, lx + 85 * u, VH / 2, 14 * u, '#94a3b8', 'center', 'normal', false);
  const rx = Math.min(VW - 16, OX + FW * S + (BORDER + HANDLE + 40) * S + 190 * u);
  let y = VH / 2 - 110 * u;
  if (G.mult > 1) { txt('⚡ RALLY x' + G.mult.toFixed(2), rx, y, 20 * u, '#facc15', 'right'); }
  y += 30 * u;
  txt('touches ' + G.touches, rx, y, 13 * u, '#94a3b8', 'right', 'normal', false);
  y += 30 * u;
  for (const s of G.seats) {
    if (s.type !== 'human') continue;
    const k = s.km;
    txt(`${s.name}: ${keyLabel(k.left)}/${keyLabel(k.right)} slide · ${keyLabel(k.up)}/${keyLabel(k.down)} tilt · ${keyLabel(k.kick)}${G.mode === '1v1' && s.id === 'P1' ? '/Space' : ''} kick · ${keyLabel(k.sw)} switch`, rx, y, 12 * u, TEAM[s.team].light, 'right', 'normal', false);
    y += 20 * u;
  }
  txt('Esc pause · Backspace re-serve · ` debug', rx, y + 6 * u, 12 * u, '#64748b', 'right', 'normal', false);
  if (G.debug) txt(`fps ${G.fps.toFixed(0)} · speed ${Math.hypot(G.ball.vx, G.ball.vy).toFixed(0)} · state ${G.state}`, 12, 16, 12, '#0ff', 'left', 'normal', false);

  if (G.state === 'ready') txt('GET READY…', VW / 2, VH / 2, 34 * u, '#fff');
  if (G.state === 'replay') {
    const blink = Math.floor(performance.now() / 400) % 2;
    txt((blink ? '● ' : '  ') + 'INSTANT REPLAY · 0.5x', VW / 2, OY + 40 * S, 26 * u, '#f87171');
    txt('Backspace to skip', VW / 2, OY + 75 * S, 14 * u, '#cbd5e1', 'center', 'normal');
  }
  if (G.banner && G.state !== 'over') {
    const b = G.banner, sc = b.t < 0.2 ? 0.4 + 3 * b.t : 1, a = Math.min(1, (b.dur - b.t) / 0.3);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); ctx.translate(VW / 2, VH / 2); ctx.scale(sc, sc);
    txt(b.title, 0, -20 * u, 84 * u, b.color); txt(b.sub, 0, 50 * u, 26 * u, '#fff');
    ctx.restore();
  }
  G.toasts.forEach((t, i) => { ctx.globalAlpha = Math.min(1, (t.dur - t.t) / 0.3); txt(t.text, VW / 2, VH / 2 + (140 + i * 34) * u, 22 * u, '#fde68a'); ctx.globalAlpha = 1; });
  for (const p of G.particles) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, p.life);
    ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
  }
  if (G.state === 'over') {
    ctx.fillStyle = 'rgba(2,6,23,.72)'; ctx.fillRect(0, 0, VW, VH);
    const T = TEAM[G.winner];
    txt(T.name.toUpperCase() + ' WINS!', VW / 2, VH / 2 - 120 * u, 72 * u, T.color);
    txt(`${G.score.A} – ${G.score.B}`.replace(/^(\d+) – (\d+)$/, G.winner === 'A' ? '$1 – $2' : '$2 – $1'), VW / 2, VH / 2 - 40 * u, 44 * u, '#fff');
    let yy = VH / 2 + 20 * u;
    for (const s of G.seats) {
      const st = stat(s.id);
      txt(`${s.name} (${TEAM[s.team].name}): ${st.g} goal${st.g === 1 ? '' : 's'}${st.og ? ' · ' + st.og + ' own goal' + (st.og > 1 ? 's' : '') + ' 🙈' : ''}`, VW / 2, yy, 20 * u, TEAM[s.team].light, 'center', 'normal');
      yy += 30 * u;
    }
    txt('R = rematch  ·  M / Esc = menu', VW / 2, yy + 30 * u, 22 * u, '#e5e7eb');
  }
  if (G.paused) {
    ctx.fillStyle = 'rgba(2,6,23,.65)'; ctx.fillRect(0, 0, VW, VH);
    txt('PAUSED', VW / 2, VH / 2 - 20 * u, 64 * u, '#fff');
    txt('Esc = resume  ·  M = quit to menu', VW / 2, VH / 2 + 40 * u, 22 * u, '#cbd5e1', 'center', 'normal');
  }
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, VW, VH);
  if (G.state === 'menu') return;
  let view;
  if (G.state === 'replay' && G.replay) {
    const R = G.replay;
    while (R.i < R.frames.length - 1 && R.frames[R.i + 1].t <= R.t) R.i++;
    const f = R.frames[R.i];
    view = { bx: f.bx, by: f.by, rods: f.r, replay: true };
  } else view = { bx: G.ball.x, by: G.ball.y, rods: G.rods.map(r => [r.c, rodAngle(r)]) };
  const sh = G.shake * 10;
  ctx.setTransform(DPR * S, 0, 0, DPR * S, DPR * (OX + (Math.random() - 0.5) * sh), DPR * (OY + (Math.random() - 0.5) * sh));
  drawTable(view);
  if (G.state === 'replay') { ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6; ctx.strokeRect(-BORDER, -BORDER, FW + 2 * BORDER, FL + 2 * BORDER); }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawHud();
}
