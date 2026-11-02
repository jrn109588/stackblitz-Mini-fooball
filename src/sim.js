/* Simulação da partida (roda só no host). Módulo puro: sem DOM e sem Supabase,
   por isso também é executado nos testes (npm test). */

export const W = 1200,
  H = 700;
export const GOAL_H = 230,
  PR = 24,
  BR = 13;
export const SPEED = 330,
  KICK = 760,
  MATCH_TIME = 180;
/* Tempo (s) após cada saída de bola em que só o time do pontapé inicial pode atacar */
export const KICKOFF_LOCK = 1.5;

/* UUID v4 gerado com o rng (crypto.randomUUID só existe em contexto seguro) */
const uuid = (rng) =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(rng() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- Simulação (roda só no host) ---------- */
function formation(team, i, n) {
  const dx = 0.14 + 0.1 * (i % 2);
  return {
    x: team === 0 ? W * (0.1 + dx) : W * (0.9 - dx),
    y: (H * (i + 1)) / (n + 1),
  };
}

export function createSim(roster, mode, bots, rng = Math.random) {
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
    rng,
    matchId: uuid(rng),
    log: [],
    logId: 0,
    /* Saída de bola: o 1º pontapé é sorteado; depois sai quem sofreu o gol */
    koTeam: rng() < 0.5 ? 0 : 1,
    koT: KICKOFF_LOCK,
  };
}

function resetPositions(sim) {
  for (const p of sim.players)
    Object.assign(p, { x: p.home.x, y: p.home.y, vx: 0, vy: 0, cd: 0 });
  Object.assign(sim.ball, { x: W / 2, y: H / 2, vx: 0, vy: 0 });
  sim.lastTouch = sim.prevTouch = null;
  sim.pinT = 0;
  sim.koT = KICKOFF_LOCK;
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
      t: s.t,
      og: s.og,
      left: !!p.left,
      n: Math.round(clamp(raw, 0, 10) * 10) / 10,
    };
  });
}

export function addLog(sim, text) {
  sim.log.push([++sim.logId, text]);
  if (sim.log.length > 20) sim.log.shift();
}

/* Jogador humano saiu: um bot assume o lugar dele, com o nome "Bot (nome)".
   Retorna a mensagem de aviso (ou null se não havia nada a fazer). */
export function replaceWithBot(sim, id) {
  const p = byId(sim, id);
  if (!p || p.bot || sim.phase === 'end') return null;
  const from = p.name;
  p.bot = true;
  p.left = true;
  p.name = `Bot (${from})`;
  p.stun = 0;
  p.jam = 0;
  delete sim.inputs[id];
  const msg = `${from} saiu da partida. ${p.name} assumiu o lugar.`;
  addLog(sim, msg);
  return msg;
}

const goHome = (p, x, y) => {
  const dx = x - p.x,
    dy = y - p.y;
  return Math.hypot(dx, dy) < 8
    ? { ix: 0, iy: 0, kick: false }
    : { ix: dx, iy: dy, kick: false };
};

function botInput(sim, p) {
  const { ball, players } = sim;

  /* Saída de bola: enquanto o time adversário não tocar na bola, os bots dele esperam
     na posição inicial (sem isso os dois times chutavam juntos e o resultado era sempre o mesmo) */
  if (sim.koT > 0 && p.team !== sim.koTeam) return goHome(p, p.home.x, p.home.y);

  const mates = players.filter((q) => q.team === p.team && q.bot);
  const chaser = mates.reduce(
    (a, q) => (dist(q, ball) < dist(a, ball) ? q : a),
    mates[0]
  );
  const goalX = p.team === 0 ? W : 0;
  const ownX = p.team === 0 ? 0 : W;

  /* Goleiro: o bot (que não é o chaser) com a posição inicial mais perto do próprio gol */
  const keeper = mates
    .filter((q) => q !== chaser)
    .reduce(
      (a, q) =>
        !a || Math.abs(q.home.x - ownX) < Math.abs(a.home.x - ownX) ? q : a,
      null
    );
  if (keeper === p) {
    const onFieldSide = (ball.x - p.x) * (goalX - ownX) > 0;
    const close = dist(p, ball) < PR + BR + 14;
    const danger = Math.abs(ball.x - ownX) < W * 0.28;
    if (danger && onFieldSide && dist(p, ball) < 170)
      return { ix: ball.x - p.x, iy: ball.y - p.y, kick: close };
    const lim = GOAL_H / 2 - 25;
    return goHome(
      p,
      ownX + (p.team === 0 ? 70 : -70),
      clamp(ball.y, H / 2 - lim, H / 2 + lim)
    );
  }

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

  /* Demais: voltam à posição e acompanham a bola; os que estão atrás dela fecham o meio */
  const behind = (ball.x - p.home.x) * (goalX - ownX) > 0;
  const hx = behind ? p.home.x : clamp(ball.x, p.home.x - 120, p.home.x + 120);
  return goHome(p, hx, p.home.y + (ball.y - H / 2) * 0.4);
}

export function step(sim, dt) {
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
  if (sim.koT > 0) sim.koT = sim.lastTouch ? 0 : sim.koT - dt;
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
        let kx = (ball.x - p.x) / (d || 1),
          ky = (ball.y - p.y) / (d || 1);
        if (p.bot) {
          /* bots erram um pouco a mira: sem isso a jogada se repete idêntica */
          const a = (sim.rng() - 0.5) * 0.3,
            c = Math.cos(a),
            sn = Math.sin(a);
          [kx, ky] = [kx * c - ky * sn, kx * sn + ky * c];
        }
        ball.vx = kx * KICK + p.vx * 0.5;
        ball.vy = ky * KICK + p.vy * 0.5;
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
    sim.koTeam = 1 - team;
    sim.phase = 'goal';
    sim.pause = 2;
    ball.vx = ball.vy = 0;
  }
}

export const snapshot = (sim) => ({
  t: Math.ceil(sim.time),
  mid: sim.matchId,
  lg: sim.log.slice(-4),
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
