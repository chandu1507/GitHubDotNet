// ============================== PHYSICS ==============================
function touch(r) {
  G.lastTouch = { team: r.team, seat: r.owner };
  if (G.simT - G.lastTouchT > 0.15) {
    G.touches++;
    const m = Math.min(1.6, 1 + 0.06 * Math.floor(G.touches / 6));
    if (m > G.mult) { G.mult = m; toast('⚡ SPEED UP x' + m.toFixed(2)); sfx('speed'); }
  }
  G.lastTouchT = G.simT;
}
function applyKick(r, fx, bonus = 1) {
  const b = G.ball;
  b.pin = null; r.trapCd = 0.35;
  const power = KICK_POWER * G.mult * (r.kick && r.kick.windup ? 1.2 : 1) * bonus;
  const dx = clamp((b.x - fx) / (FIG_W / 2 + BALL_R), -1, 1);
  b.vy = r.dir * power * (1 - 0.3 * Math.abs(dx));
  b.vx = dx * power * 0.5 + r.vx * 0.6;
  const minRel = FIG_D / 2 + BALL_R + REACH * 0.9;
  if ((b.y - r.y) * r.dir < minRel) b.y = r.y + r.dir * minRel;
  touch(r); G.lastKick = { team: r.team, seat: r.owner };
  sfx('kick'); G.shake = Math.max(G.shake, 0.15);
}
function tryKick(r) {
  const b = G.ball;
  for (let i = 0; i < r.n; i++) {
    const fx = figX(r, i), rel = (b.y - r.y) * r.dir;
    if (rel > -FIG_D / 2 && rel < FIG_D / 2 + BALL_R + REACH + 8 && Math.abs(b.x - fx) < FIG_W / 2 + BALL_R) {
      applyKick(r, fx); r.kickHit = true; return;
    }
  }
}
function collideRect(cx, cy, hw, hh, bvx, bvy, e) {
  const b = G.ball;
  const px = clamp(b.x, cx - hw, cx + hw), py = clamp(b.y, cy - hh, cy + hh);
  const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
  if (d2 >= BALL_R * BALL_R) return false;
  let nx, ny;
  if (d2 < 1e-6) {
    const ox = hw - Math.abs(b.x - cx), oy = hh - Math.abs(b.y - cy);
    if (ox < oy) { nx = Math.sign(b.x - cx) || 1; ny = 0; b.x = cx + nx * (hw + BALL_R); }
    else { nx = 0; ny = Math.sign(b.y - cy) || 1; b.y = cy + ny * (hh + BALL_R); }
  } else {
    const d = Math.sqrt(d2); nx = dx / d; ny = dy / d;
    b.x = px + nx * BALL_R; b.y = py + ny * BALL_R;
  }
  const vn = (b.vx - bvx) * nx + (b.vy - bvy) * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return true;
}
function collidePoint(px, py) {
  const b = G.ball, dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
  if (d2 >= BALL_R * BALL_R || d2 < 1e-9) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
  b.x = px + nx * BALL_R; b.y = py + ny * BALL_R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; sfx('wall'); }
}
function moveBall(h) {
  const b = G.ball;
  b.x += b.vx * h; b.y += b.vy * h;
  if (b.x < BALL_R) { b.x = BALL_R; if (b.vx < 0) { b.vx = -b.vx * E_WALL; sfx('wall'); } }
  if (b.x > FW - BALL_R) { b.x = FW - BALL_R; if (b.vx > 0) { b.vx = -b.vx * E_WALL; sfx('wall'); } }
  const inMouth = b.x > GX0 && b.x < GX1;
  if (!inMouth) {
    if (b.y < BALL_R) { b.y = BALL_R; if (b.vy < 0) { b.vy = -b.vy * E_WALL; sfx('wall'); } }
    if (b.y > FL - BALL_R) { b.y = FL - BALL_R; if (b.vy > 0) { b.vy = -b.vy * E_WALL; sfx('wall'); } }
  } else if (b.y < 0 || b.y > FL) {
    if (b.x < GX0 + BALL_R) { b.x = GX0 + BALL_R; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > GX1 - BALL_R) { b.x = GX1 - BALL_R; b.vx = -Math.abs(b.vx) * 0.5; }
  }
  collidePoint(GX0, 0); collidePoint(GX1, 0); collidePoint(GX0, FL); collidePoint(GX1, FL);
  if (b.y < -BALL_R) { scoreGoal('A'); return; }
  if (b.y > FL + BALL_R) { scoreGoal('B'); return; }
  for (const r of G.rods) {
    if (Math.abs(b.y - r.y) > REACH + FIG_D + BALL_R + 2) continue;
    const ang = rodAngle(r);
    if (!blocks(ang)) continue;
    const fy = footY(r, ang);
    for (let i = 0; i < r.n; i++) {
      const fx = figX(r, i);
      if (collideRect(fx, fy, FIG_W / 2, FIG_D / 2, r.vx, 0, E_FIG)) {
        touch(r); sfx('hit');
        const sp = Math.hypot(b.vx, b.vy);
        if (!r.kick && ang >= TRAP_MIN && ang <= TRAP_MAX && r.trapCd <= 0 && sp < TRAP_SPEED && (b.y - fy) * r.dir > 0) {
          b.pin = { rod: r.idx, i, ox: clamp(b.x - fx, -8, 8), t: 0 };
          b.vx = b.vy = 0; sfx('trap');
          return;
        }
      }
    }
  }
}
function updatePin(h) {
  const b = G.ball, p = b.pin, r = G.rods[p.rod];
  p.t += h;
  const ang = rodAngle(r);
  if (p.t > PIN_MAX) { b.pin = null; r.trapCd = 1; b.vy = r.dir * 120; b.vx = 0; toast('⏱ 10 s pin limit, ball released'); return; }
  if (!r.kick && (ang < TRAP_MIN - 8 || ang > TRAP_MAX + 8)) { b.pin = null; r.trapCd = 0.4; b.vx = r.vx * 0.5; b.vy = r.dir * 60; return; }
  const fx = figX(r, p.i), fy = footY(r, ang);
  b.x = clamp(fx + p.ox, BALL_R, FW - BALL_R);
  b.y = fy + r.dir * (FIG_D / 2 + BALL_R + 0.5);
  b.vx = r.vx; b.vy = 0;
}
function physics(h) {
  const b = G.ball;
  for (const r of G.rods) if (r.kick && !r.kickHit && r.kick.t <= KICK_OUT) tryKick(r);
  if (b.pin) { updatePin(h); G.stillT = 0; return; }
  const sp = Math.hypot(b.vx, b.vy);
  const n = Math.min(12, Math.max(1, Math.ceil(sp * h / (BALL_R * 0.5))));
  for (let k = 0; k < n; k++) { moveBall(h / n); if (G.state !== 'play' || b.pin) return; }
  const f = Math.exp(-FRICTION * h); b.vx *= f; b.vy *= f;
  if (Math.hypot(b.vx, b.vy) < 90) {
    let near = null, nd = Infinity;
    for (const r of G.rods) {
      const rel = (b.y - r.y) * r.dir;
      if (rel > -6 && rel < nd) { nd = rel; near = r; }
    }
    if (near) {
      const spot = near.y + near.dir * 22;
      if (Math.abs(spot - b.y) > 4) b.vy += Math.sign(spot - b.y) * 130 * h;
    }
    if (b.y < 90 || b.y > FL - 90) b.vx += Math.sign(FW / 2 - b.x) * 90 * h;
  }
  const s2 = Math.hypot(b.vx, b.vy), cap = MAX_SPEED * G.mult;
  if (s2 > cap) { b.vx *= cap / s2; b.vy *= cap / s2; }
  if (s2 < 22) { G.stillT += h; if (G.stillT > DEAD_T) { toast('💤 Dead ball, re-serve'); serve(); } }
  else G.stillT = 0;
}

function scoreGoal(team) {
  const conceding = team === 'A' ? 'B' : 'A';
  const lt = G.lastTouch, lk = G.lastKick;
  const own = !!(lt && lt.team === conceding && (!lk || lk.team === conceding));
  const scorer = lk && lk.team === team ? lk : (lt && lt.team === team ? lt : null);
  G.score[team]++;
  let title, sub;
  if (own) { title = 'OWN GOAL!'; sub = pick(OWN_LINES).replace('{n}', seatName(lt.seat)); stat(lt.seat).og++; sfx('own'); }
  else { title = pick(GOAL_LINES); sub = (scorer ? seatName(scorer.seat) : TEAM[team].name) + ' scores for ' + TEAM[team].name; if (scorer) stat(scorer.seat).g++; sfx('goal'); }
  G.banner = { title, sub, color: own ? '#facc15' : TEAM[team].color, t: 0, dur: GOAL_PAUSE + 0.2 };
  confetti(team, own ? 60 : 160);
  G.shake = 0.6; G.state = 'goal'; G.timer = GOAL_PAUSE; G.goalT = G.simT;
  G.ball.vx = G.ball.vy = 0; G.ball.pin = null;
}
function record() {
  G.rec.push({ t: G.simT, bx: G.ball.x, by: G.ball.y, r: G.rods.map(r => [r.c, rodAngle(r)]) });
  while (G.rec.length && G.rec[0].t < G.simT - 4.5) G.rec.shift();
}
function startReplay() {
  const frames = G.rec.filter(f => f.t >= G.goalT - 3.2 && f.t <= G.goalT + 0.25);
  if (frames.length < 10) return endReplay();
  G.replay = { frames, t: frames[0].t, end: frames[frames.length - 1].t, i: 0 };
  G.state = 'replay';
}
function endReplay() {
  G.replay = null;
  if (G.score.A >= G.target || G.score.B >= G.target) endGame(); else serve();
}
function endGame() {
  G.winner = G.score.A >= G.target ? 'A' : 'B';
  G.state = 'over'; sfx('win');
  confetti(G.winner, 300);
  const lb = loadJSON('foosball.lb.v1', {});
  for (const s of G.seats) {
    if (s.type !== 'human') continue;
    const e = lb[s.name] = lb[s.name] || { w: 0, l: 0, g: 0, og: 0, p: 0 };
    e.p++; if (s.team === G.winner) e.w++; else e.l++;
    e.g += stat(s.id).g; e.og += stat(s.id).og;
  }
  saveJSON('foosball.lb.v1', lb);
}

function toast(text) { G.toasts.push({ text, t: 0, dur: 1.6 }); if (G.toasts.length > 3) G.toasts.shift(); }
function confetti(team, count) {
  const gx = OX + FW / 2 * S, gy = team === 'A' ? OY : OY + FL * S;
  const cols = [TEAM[team].color, TEAM[team].light, '#ffffff', '#facc15'];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 600;
    G.particles.push({ x: gx, y: gy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 250, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      c: pick(cols), life: 1.6 + Math.random() * 1.2, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4 });
  }
}
function updateFx(dt) {
  for (const p of G.particles) { p.vy += 700 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt; }
  G.particles = G.particles.filter(p => p.life > 0);
  for (const t of G.toasts) t.t += dt;
  G.toasts = G.toasts.filter(t => t.t < t.dur);
  if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.dur && G.state !== 'over') G.banner = null; }
  G.shake = Math.max(0, G.shake - dt * 1.5);
}
