import { supabase } from './supabase.js';

const W = 1200,
  H = 700,
  OX = 70;
const GOAL_H = 230,
  PR = 24,
  BR = 13;
const SPEED = 330,
  KICK = 760,
  MATCH_TIME = 180;

/* ---------- Opções de personalização (usadas também na sala) ---------- */
export const SKINS = [
  '#ffdbb0',
  '#f1c27d',
  '#d9a066',
  '#b9794a',
  '#8d5524',
  '#5c3a21',
];
export const HAIR_COLORS = [
  '#1b1b1b',
  '#5a3825',
  '#b5651d',
  '#e6c15a',
  '#c0392b',
  '#9aa3ad',
];
export const HAIR_STYLES = ['Careca', 'Curto', 'Moicano', 'Boné'];
export const PATTERNS = ['Liso', 'Listras', 'Metade'];
export const FIELDS = {
  gramado: {
    label: 'Gramado',
    a: '#2f7d3a',
    b: '#348a41',
    line: 'rgba(255,255,255,.85)',
  },
  noturno: {
    label: 'Noturno',
    a: '#1c4d2c',
    b: '#215a33',
    line: 'rgba(220,255,230,.8)',
  },
  areia: {
    label: 'Areia',
    a: '#d8b878',
    b: '#cfae6b',
    line: 'rgba(255,255,255,.9)',
  },
  quadra: {
    label: 'Quadra',
    a: '#2d6cb5',
    b: '#2a63a8',
    line: 'rgba(255,255,255,.9)',
  },
};
export const BALLS = {
  classica: {
    label: 'Clássica',
    fill: '#ffffff',
    edge: '#111111',
    dot: '#111111',
  },
  laranja: {
    label: 'Laranja',
    fill: '#ff8a1f',
    edge: '#5a2a00',
    dot: '#5a2a00',
  },
  neon: { label: 'Neon', fill: '#c8ff2e', edge: '#2a3a00', dot: '#2a3a00' },
  preta: { label: 'Preta', fill: '#262626', edge: '#ffffff', dot: '#ffffff' },
};

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
export const textOn = (hex) => {
  const [r, g, b] = rgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
};
export const colorDist = (a, b) => {
  const x = rgb(a),
    y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const esc = (t = '') =>
  String(t).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Desenho do boneco (vista de cima) ---------- */
export function drawPlayer(ctx, x, y, o) {
  const { c1, c2, pat, look, captain, me } = o;
  const f = o.face || { dx: 1, dy: 0 };
  const fl = Math.hypot(f.dx, f.dy) || 1;
  const fx = f.dx / fl,
    fy = f.dy / fl;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, PR, 0, 7);
  ctx.fillStyle = c1;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, PR, 0, 7);
  ctx.clip();
  ctx.fillStyle = c2;
  if (pat === 1)
    for (const px of [-17, -4, 9]) ctx.fillRect(px, -PR, 7, PR * 2);
  if (pat === 2) ctx.fillRect(-PR, 0, PR * 2, PR);
  if (captain) {
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#000';
    ctx.fillRect(-PR * 2, -5, PR * 4, 10);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, PR, 0, 7);
  ctx.lineWidth = me ? 5 : 3;
  ctx.strokeStyle = me ? '#ffd60a' : '#fff';
  ctx.stroke();

  const skin = SKINS[look.skin] || SKINS[1],
    hair = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0];
  const hx = fx * 4,
    hy = fy * 4,
    hs = look.hairStyle;
  const disc = (px, py, r, c) => {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, 7);
    ctx.fillStyle = c;
    ctx.fill();
  };
  if (hs === 1) {
    disc(hx, hy, 11, hair);
    disc(hx + fx * 3, hy + fy * 3, 8, skin);
  } else {
    disc(hx, hy, 10, skin);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.stroke();
    if (hs === 2) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(Math.atan2(fy, fx));
      ctx.beginPath();
      ctx.ellipse(-1, 0, 9, 3.5, 0, 0, 7);
      ctx.fillStyle = hair;
      ctx.fill();
      ctx.restore();
    }
    if (hs === 3) {
      disc(hx - fx * 2, hy - fy * 2, 10, hair);
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(Math.atan2(fy, fx));
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(6, -5, 8, 10);
      ctx.restore();
    }
  }
  const tc = textOn(c1);
  ctx.font = '700 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = tc === '#111111' ? '#ffffff' : '#000000';
  ctx.strokeText(String(look.number), -11, 13);
  ctx.fillStyle = tc;
  ctx.fillText(String(look.number), -11, 13);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawBall(ctx, x, y, t) {
  ctx.beginPath();
  ctx.arc(x, y, BR, 0, 7);
  ctx.fillStyle = t.fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = t.edge;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, 7);
  ctx.fillStyle = t.dot;
  ctx.fill();
}

const botLook = (id) => {
  const p = String(id).split('-'),
    t = +p[1] || 0,
    i = +p[2] || 0;
  return {
    skin: (i * 2 + t) % 6,
    hairColor: (i + t * 3) % 6,
    hairStyle: (i + 1) % 4,
    number: (i % 98) + 2,
  };
};

/* ---------- Simulação (roda só no host) ---------- */
function formation(team, i, n) {
  const dx = 0.14 + 0.1 * (i % 2);
  return {
    x: team === 0 ? W * (0.1 + dx) : W * (0.9 - dx),
    y: (H * (i + 1)) / (n + 1),
  };
}

function createSim(roster, mode, bots) {
  const players = [];
  for (const team of [0, 1]) {
    const humans = roster.filter((r) => r.team === team);
    const size = bots ? mode : humans.length;
    for (let i = 0; i < size; i++) {
      const h = humans[i];
      const home = formation(team, i, size);
      players.push({
        id: h ? h.id : `bot-${team}-${i}`,
        name: h ? h.name : `Bot ${i + 1}`,
        team,
        bot: !h,
        home,
        x: home.x,
        y: home.y,
        vx: 0,
        vy: 0,
        r: PR,
        m: 3,
        cd: 0,
        stun: 0,
        jam: 0,
        push: false,
        px: home.x,
        py: home.y,
        stats: { g: 0, a: 0, k: 0, t: 0, og: 0 },
      });
    }
  }
  const posts = [];
  for (const x of [0, W])
    for (const y of [H / 2 - GOAL_H / 2, H / 2 + GOAL_H / 2])
      posts.push({ x, y, r: 8, m: 1e6, vx: 0, vy: 0 });
  return {
    players,
    posts,
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BR, m: 1 },
    score: [0, 0],
    time: MATCH_TIME,
    phase: 'play',
    pause: 0,
    inputs: {},
    winner: null,
    goalTeam: null,
    goalName: '',
    lastTouch: null,
    prevTouch: null,
    pinT: 0,
    report: null,
  };
}

function resetPositions(sim) {
  for (const p of sim.players)
    Object.assign(p, { x: p.home.x, y: p.home.y, vx: 0, vy: 0, cd: 0 });
  Object.assign(sim.ball, { x: W / 2, y: H / 2, vx: 0, vy: 0 });
  sim.lastTouch = sim.prevTouch = null;
  sim.pinT = 0;
}

function collide(a, b, e) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const d = Math.hypot(dx, dy),
    min = a.r + b.r;
  if (d >= min || d === 0) return;
  const nx = dx / d,
    ny = dy / d,
    tm = a.m + b.m,
    push = min - d;
  a.x -= nx * push * (b.m / tm);
  a.y -= ny * push * (b.m / tm);
  b.x += nx * push * (a.m / tm);
  b.y += ny * push * (a.m / tm);
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv > 0) return;
  const j = (-(1 + e) * rv) / (1 / a.m + 1 / b.m);
  a.vx -= (j / a.m) * nx;
  a.vy -= (j / a.m) * ny;
  b.vx += (j / b.m) * nx;
  b.vy += (j / b.m) * ny;
}

/* Paredes: só rebate se a bola estiver indo para fora (não amortece várias vezes) */
function wallBall(ball) {
  if (ball.y < BR) {
    ball.y = BR;
    if (ball.vy < 0) ball.vy *= -0.8;
  }
  if (ball.y > H - BR) {
    ball.y = H - BR;
    if (ball.vy > 0) ball.vy *= -0.8;
  }
  if (Math.abs(ball.y - H / 2) >= GOAL_H / 2) {
    if (ball.x < BR) {
      ball.x = BR;
      if (ball.vx < 0) ball.vx *= -0.8;
    }
    if (ball.x > W - BR) {
      ball.x = W - BR;
      if (ball.vx > 0) ball.vx *= -0.8;
    }
  }
}
const ballOnWall = (b) =>
  b.y <= BR + 2 ||
  b.y >= H - BR - 2 ||
  ((b.x <= BR + 2 || b.x >= W - BR - 2) && Math.abs(b.y - H / 2) >= GOAL_H / 2);

const byId = (sim, id) => sim.players.find((p) => p.id === id);

function touch(sim, p) {
  if (sim.lastTouch === p.id) return;
  const prev = sim.lastTouch && byId(sim, sim.lastTouch);
  sim.prevTouch = prev && prev.team === p.team ? prev.id : null;
  sim.lastTouch = p.id;
  p.stats.t++;
}

function registerGoal(sim, team) {
  const scorer = sim.lastTouch && byId(sim, sim.lastTouch);
  sim.goalName = '';
  if (!scorer) return;
  if (scorer.team === team) {
    scorer.stats.g++;
    sim.goalName = scorer.name;
    const as = sim.prevTouch && byId(sim, sim.prevTouch);
    if (as && as.id !== scorer.id) as.stats.a++;
  } else {
    scorer.stats.og++;
    sim.goalName = scorer.name + ' (contra)';
  }
}

/* Nota de 0 a 10,0: base 5,0 + gols, assistências, chutes, participação e resultado */
function makeReport(sim) {
  return sim.players.map((p) => {
    const s = p.stats;
    const res = sim.winner === -1 ? 0.3 : sim.winner === p.team ? 1.0 : -0.3;
    const raw =
      5 +
      1.3 * s.g +
      0.9 * s.a +
      Math.min(1, 0.1 * s.k) +
      Math.min(0.8, 0.04 * s.t) +
      res -
      0.8 * s.og;
    return {
      id: p.id,
      name: p.name,
      team: p.team,
      g: s.g,
      a: s.a,
      k: s.k,
      og: s.og,
      n: Math.round(clamp(raw, 0, 10) * 10) / 10,
    };
  });
}

function botInput(sim, p) {
  const { ball, players } = sim;
  const mates = players.filter((q) => q.team === p.team && q.bot);
  const chaser = mates.reduce(
    (a, q) => (dist(q, ball) < dist(a, ball) ? q : a),
    mates[0]
  );
  const goalX = p.team === 0 ? W : 0;
  if (chaser === p) {
    const gx = goalX - ball.x,
      gy = H / 2 - ball.y,
      gl = Math.hypot(gx, gy) || 1;
    const near = dist(p, ball) < PR + BR + 14;
    const facing = (ball.x - p.x) * (goalX - p.x) > 0;
    const t =
      near && facing
        ? ball
        : {
            x: ball.x - (gx / gl) * (PR + BR),
            y: ball.y - (gy / gl) * (PR + BR),
          };
    return { ix: t.x - p.x, iy: t.y - p.y, kick: near && facing };
  }
  const dx = p.home.x - p.x,
    dy = p.home.y + (ball.y - H / 2) * 0.4 - p.y;
  return Math.hypot(dx, dy) < 8
    ? { ix: 0, iy: 0, kick: false }
    : { ix: dx, iy: dy, kick: false };
}

function step(sim, dt) {
  const { players, ball, posts } = sim;
  if (sim.phase === 'end') return;
  if (sim.phase === 'goal') {
    sim.pause -= dt;
    if (sim.pause <= 0) {
      resetPositions(sim);
      sim.phase = 'play';
    }
    return;
  }
  sim.time -= dt;
  if (sim.time <= 0) {
    sim.time = 0;
    sim.phase = 'end';
    sim.winner =
      sim.score[0] === sim.score[1] ? -1 : sim.score[0] > sim.score[1] ? 0 : 1;
    sim.report = makeReport(sim);
    return;
  }
  const now = performance.now();
  let kicker = null;
  for (const p of players) {
    let ix = 0,
      iy = 0,
      kick = false;
    p.stun = (p.stun || 0) - dt;
    if (p.stun > 0) {
      /* recuo após disputa travada: sem controle por um instante */
    } else if (p.bot) ({ ix, iy, kick } = botInput(sim, p));
    else {
      const inp = sim.inputs[p.id];
      if (inp && now - inp.t < 600) {
        ix = inp.dx;
        iy = inp.dy;
        kick = inp.k;
      }
    }
    const len = Math.hypot(ix, iy);
    p.px = p.x;
    p.py = p.y;
    p.push = len > 0.1;
    const tx = len ? (ix / len) * SPEED : 0,
      ty = len ? (iy / len) * SPEED : 0;
    const k = Math.min(1, dt * 9);
    p.vx += (tx - p.vx) * k;
    p.vy += (ty - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.cd -= dt;
    if (kick && p.cd <= 0) {
      const d = dist(p, ball);
      if (d < PR + BR + 16) {
        ball.vx = ((ball.x - p.x) / (d || 1)) * KICK + p.vx * 0.5;
        ball.vy = ((ball.y - p.y) / (d || 1)) * KICK + p.vy * 0.5;
        p.cd = 0.3;
        p.stats.k++;
        kicker = p;
      }
    }
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const damp = Math.pow(0.55, dt);
  ball.vx *= damp;
  ball.vy *= damp;

  /* Várias passadas: resolve o aperto da bola contra a parede/canto.
     Com a bola na parede ela fica "pesada", então os jogadores é que são empurrados. */
  for (let it = 0; it < 3; it++) {
    ball.m = ballOnWall(ball) ? 40 : 1;
    for (let i = 0; i < players.length; i++) {
      collide(players[i], ball, 0.7);
      for (let j = i + 1; j < players.length; j++)
        collide(players[i], players[j], 0.2);
      for (const po of posts) collide(po, players[i], 0.3);
    }
    for (const po of posts) collide(po, ball, 0.6);
    for (const p of players) {
      p.x = clamp(p.x, PR, W - PR);
      p.y = clamp(p.y, PR, H - PR);
    }
    wallBall(ball);
  }
  ball.m = 1;

  /* Jogadores travados um no outro (ex.: os dois empurrando no canto): depois de 0,2 s
     quem está mais longe da bola recua e perde o controle por um instante, e o outro segue. */
  for (const p of players) {
    const other = players.find((q) => q !== p && dist(p, q) < PR * 2 + 3);
    const moved = Math.hypot(p.x - p.px, p.y - p.py) / dt;
    if (other && p.push && moved < 60 && p.stun <= 0) {
      p.jam += dt;
      if (p.jam > 0.18) {
        const dp = dist(p, ball),
          dq = dist(other, ball);
        const winner = Math.abs(dp - dq) > 1 ? dp < dq : p.id < other.id;
        if (!winner) {
          const d = dist(p, other) || 1;
          const cx = W / 2 - p.x,
            cy = H / 2 - p.y,
            cl = Math.hypot(cx, cy) || 1;
          p.vx = ((p.x - other.x) / d) * 260 + (cx / cl) * 120;
          p.vy = ((p.y - other.y) / d) * 260 + (cy / cl) * 120;
          p.stun = 0.5;
        }
        p.jam = 0;
      }
    } else p.jam = 0;
  }

  for (const p of players) if (dist(p, ball) < PR + BR + 2) touch(sim, p);
  if (kicker) touch(sim, kicker);

  /* Disputa travada: bola na parede/canto entre 2+ jogadores, quase parada.
     Depois de 0,12 s a bola é solta para o centro e os jogadores recuam por um instante. */
  const around = players.filter((p) => dist(p, ball) < PR + BR + 3);
  if (
    around.length >= 2 &&
    ballOnWall(ball) &&
    Math.hypot(ball.vx, ball.vy) < 90
  ) {
    sim.pinT += dt;
    if (sim.pinT > 0.12) {
      const cx = W / 2 - ball.x,
        cy = H / 2 - ball.y,
        l = Math.hypot(cx, cy) || 1;
      ball.vx = (cx / l) * 440;
      ball.vy = (cy / l) * 440;
      for (const p of around) {
        const d = dist(p, ball) || 1;
        p.vx = ((p.x - ball.x) / d) * 380;
        p.vy = ((p.y - ball.y) / d) * 380;
        p.stun = 0.3;
      }
      sim.pinT = 0;
    }
  } else sim.pinT = 0;

  if (ball.x < -BR || ball.x > W + BR) {
    const team = ball.x < 0 ? 1 : 0;
    sim.score[team]++;
    registerGoal(sim, team);
    sim.goalTeam = team;
    sim.phase = 'goal';
    sim.pause = 2;
    ball.vx = ball.vy = 0;
  }
}

const snapshot = (sim) => ({
  t: Math.ceil(sim.time),
  s: sim.score,
  ph: sim.phase,
  w: sim.winner,
  gt: sim.goalTeam,
  gn: sim.goalName,
  p: sim.players.map((p) => [
    p.id,
    Math.round(p.x),
    Math.round(p.y),
    p.team,
    p.name,
  ]),
  b: [Math.round(sim.ball.x), Math.round(sim.ball.y)],
  r: sim.phase === 'end' ? sim.report : undefined,
});

/* ---------- Cliente: entrada, rede e desenho ---------- */
export function startGame({
  canvas,
  hud,
  lobby,
  roster,
  me,
  isHost,
  config,
  onEnd,
}) {
  const ctx = canvas.getContext('2d');
  canvas.width = W + OX * 2;
  canvas.height = H;
  const theme = FIELDS[config.field] || FIELDS.gramado;
  const ballTheme = BALLS[config.ball] || BALLS.classica;
  const teams = config.teams,
    looks = config.looks || {};
  hud.redName.textContent = teams[0].name;
  hud.blueName.textContent = teams[1].name;
  Object.assign(hud.redTag.style, {
    background: teams[0].c1,
    color: textOn(teams[0].c1),
  });
  Object.assign(hud.blueTag.style, {
    background: teams[1].c1,
    color: textOn(teams[1].c1),
  });

  const ch = supabase.channel('game-' + lobby.id, {
    config: { broadcast: { self: false } },
  });
  const sim = isHost ? createSim(roster, lobby.mode, lobby.bots) : null;
  const keys = {},
    smooth = {};
  let st = null,
    ready = false,
    stopped = false,
    raf,
    endTimer,
    frame = 0,
    last = performance.now(),
    lastSend = 0,
    lastKey = '';
  let boardShown = false,
    ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnd && onEnd();
  };

  ch.on('broadcast', { event: 'input' }, ({ payload }) => {
    if (sim) sim.inputs[payload.id] = { ...payload, t: performance.now() };
  });
  ch.on('broadcast', { event: 'state' }, ({ payload }) => {
    if (!isHost) st = payload;
  });
  ch.subscribe((s) => {
    ready = s === 'SUBSCRIBED';
  });

  const onKey = (down) => (e) => {
    keys[e.code] = down;
    if (
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        e.code
      )
    )
      e.preventDefault();
  };
  const kd = onKey(true),
    ku = onKey(false);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);

  const readInput = () => ({
    dx:
      (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    dy:
      (keys.KeyS || keys.ArrowDown ? 1 : 0) -
      (keys.KeyW || keys.ArrowUp ? 1 : 0),
    k: !!keys.Space,
  });

  function loop(now) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const inp = readInput();
    if (isHost) {
      sim.inputs[me.id] = { ...inp, t: performance.now() };
      step(sim, dt);
      st = snapshot(sim);
      if (++frame % 3 === 0 && ready)
        ch.send({ type: 'broadcast', event: 'state', payload: st });
      if (st.ph === 'end' && !endTimer) endTimer = setTimeout(finish, 30000);
    } else if (ready) {
      const key = `${inp.dx}${inp.dy}${inp.k}`;
      if (key !== lastKey || now - lastSend > 100) {
        ch.send({
          type: 'broadcast',
          event: 'input',
          payload: { id: me.id, ...inp },
        });
        lastKey = key;
        lastSend = now;
      }
    }
    draw();
    raf = requestAnimationFrame(loop);
  }

  function field() {
    ctx.fillStyle = theme.a;
    ctx.fillRect(0, 0, canvas.width, H);
    ctx.save();
    ctx.translate(OX, 0);
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = i % 2 ? theme.a : theme.b;
      ctx.fillRect((W / 12) * i, 0, W / 12, H);
    }
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 90, 0, 7);
    ctx.stroke();
    ctx.strokeRect(0, H / 2 - 170, 170, 340);
    ctx.strokeRect(W - 170, H / 2 - 170, 170, 340);
    for (const [x, c] of [
      [-OX, teams[0].c1],
      [W, teams[1].c1],
    ]) {
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.fillRect(x, H / 2 - GOAL_H / 2, OX, GOAL_H);
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.strokeRect(x, H / 2 - GOAL_H / 2, OX, GOAL_H);
    }
    ctx.restore();
  }

  function showBoard() {
    const rows = [...st.r].sort((a, b) => b.n - a.n);
    const mvp = rows[0] && rows[0].id;
    const head = st.w === -1 ? 'Empate' : `${teams[st.w].name} venceu`;
    const body = rows
      .map(
        (r) =>
          `<tr><td><span class="dot" style="background:${
            teams[r.team].c1
          }"></span>${esc(r.name)}${
            config.captains[r.team] === r.id ? ' (C)' : ''
          }${r.og ? ` (${r.og} contra)` : ''}${
            r.id === mvp ? ' <em>melhor em campo</em>' : ''
          }</td><td>${r.g}</td><td>${r.a}</td><td>${
            r.k
          }</td><td class="nota">${r.n.toFixed(1).replace('.', ',')}</td></tr>`
      )
      .join('');
    hud.board.innerHTML = `<h2>Fim de jogo</h2>
      <p class="final">${esc(teams[0].name)} ${st.s[0]} x ${st.s[1]} ${esc(
      teams[1].name
    )}</p>
      <p class="sub">${esc(head)}</p>
      <table><tr><th>Jogador</th><th>Gols</th><th>Assist.</th><th>Chutes</th><th>Nota</th></tr>${body}</table>
      ${
        isHost
          ? '<button id="voltar">Voltar ao lobby</button>'
          : '<p class="sub">Aguardando o host voltar ao lobby...</p>'
      }`;
    hud.board.hidden = false;
    const b = hud.board.querySelector('#voltar');
    if (b) b.onclick = finish;
  }

  function draw() {
    field();
    if (!st) {
      ctx.fillStyle = '#fff';
      ctx.font = '40px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando o host...', canvas.width / 2, H / 2);
      return;
    }
    const f = isHost ? 1 : 0.35;
    ctx.save();
    ctx.translate(OX, 0);
    ctx.textAlign = 'center';
    for (const [id, x, y, team, name] of st.p) {
      const s = (smooth[id] ||= { x, y, fx: team === 0 ? 1 : -1, fy: 0 });
      const ox = s.x,
        oy = s.y;
      s.x += (x - s.x) * f;
      s.y += (y - s.y) * f;
      const mx = s.x - ox,
        my = s.y - oy,
        ml = Math.hypot(mx, my);
      if (ml > 0.4) {
        s.fx += (mx / ml - s.fx) * 0.25;
        s.fy += (my / ml - s.fy) * 0.25;
      }
      const t = teams[team];
      drawPlayer(ctx, s.x, s.y, {
        c1: t.c1,
        c2: t.c2,
        pat: t.pat,
        look: looks[id] || botLook(id),
        face: { dx: s.fx, dy: s.fy },
        captain: config.captains[team] === id,
        me: id === me.id,
      });
      ctx.font = '600 16px sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(name, s.x, s.y - PR - 8);
      ctx.fillStyle = '#fff';
      ctx.fillText(name, s.x, s.y - PR - 8);
    }
    const b = (smooth.ball ||= { x: st.b[0], y: st.b[1] });
    b.x += (st.b[0] - b.x) * f;
    b.y += (st.b[1] - b.y) * f;
    drawBall(ctx, b.x, b.y, ballTheme);
    ctx.restore();
    hud.red.textContent = st.s[0];
    hud.blue.textContent = st.s[1];
    hud.time.textContent = `${Math.floor(st.t / 60)}:${String(
      st.t % 60
    ).padStart(2, '0')}`;
    if (st.ph === 'goal') {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, H / 2 - 70, canvas.width, 140);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '700 56px sans-serif';
      ctx.fillText(`GOL do ${teams[st.gt].name}!`, canvas.width / 2, H / 2 + 5);
      if (st.gn) {
        ctx.font = '600 30px sans-serif';
        ctx.fillText(st.gn, canvas.width / 2, H / 2 + 50);
      }
    }
    if (st.ph === 'end' && st.r && !boardShown) {
      boardShown = true;
      showBoard();
    }
  }

  raf = requestAnimationFrame(loop);
  return function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(endTimer);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    supabase.removeChannel(ch);
  };
}
