import { supabase } from './supabase.js';
import {
  W,
  H,
  GOAL_H,
  PR,
  BR,
  createSim,
  step,
  snapshot,
  replaceWithBot,
} from './sim.js';

const OX = 70;
/* Tempo de tolerância a uma queda de conexão antes do bot assumir o lugar */
const LEAVE_GRACE = 2500;

/* ---------- Opções da sala (campo, bola, estampa dos times) ---------- */
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
/* ---------- Desenho do jogador (vista de cima): só as cores do time ---------- */
function drawPlayer(ctx, x, y, o) {
  const { c1, c2, pat, captain, me } = o;
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
  /* marca de direção (para onde o jogador está virado) */
  ctx.beginPath();
  ctx.arc(fx * PR * 0.5, fy * PR * 0.5, 6, 0, 7);
  ctx.fillStyle = textOn(c1) === '#111111' ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.85)';
  ctx.fill();
  ctx.restore();
}

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
  onResult,
}) {
  const ctx = canvas.getContext('2d');
  canvas.width = W + OX * 2;
  canvas.height = H;
  const theme = FIELDS[config.field] || FIELDS.gramado;
  const ballTheme = BALLS[config.ball] || BALLS.classica;
  const teams = config.teams;
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
    config: { broadcast: { self: false }, presence: { key: me.id } },
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
  const seenLog = new Set(),
    leaving = new Map(),
    timers = new Set();

  /* Avisos na tela (ex.: jogador saiu) */
  const toast = (text) => {
    if (!hud.toasts) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    hud.toasts.appendChild(el);
    const t = setTimeout(() => {
      el.remove();
      timers.delete(t);
    }, 7000);
    timers.add(t);
  };
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
  /* Só o host (que roda a simulação) reage a quem sai: o bot assume o lugar */
  if (isHost) {
    ch.on('presence', { event: 'join' }, ({ key }) => {
      clearTimeout(leaving.get(key));
      leaving.delete(key);
    });
    ch.on('presence', { event: 'leave' }, ({ key }) => {
      if (key === me.id || leaving.has(key)) return;
      leaving.set(
        key,
        setTimeout(() => {
          leaving.delete(key);
          replaceWithBot(sim, key);
        }, LEAVE_GRACE)
      );
    });
  }
  ch.subscribe((s) => {
    ready = s === 'SUBSCRIBED';
    if (ready) ch.track({ id: me.id });
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
          }</td><td>${r.g}</td><td>${r.a}</td><td>${r.k}</td><td>${r.t}</td><td class="nota">${r.n.toFixed(1).replace('.', ',')}</td></tr>`
      )
      .join('');
    hud.board.innerHTML = `<h2>Fim de jogo</h2>
      <p class="final">${esc(teams[0].name)} ${st.s[0]} x ${st.s[1]} ${esc(
      teams[1].name
    )}</p>
      <p class="sub">${esc(head)}</p>
      <table><tr><th>Jogador</th><th>Gols</th><th>Assist.</th><th>Chutes</th><th>Toques</th><th>Nota</th></tr>${body}</table>
      <p class="sub" id="saved"></p>
      ${
        isHost
          ? '<button id="voltar">Voltar ao lobby</button>'
          : '<p class="sub">Aguardando o host voltar ao lobby...</p>'
      }`;
    hud.board.hidden = false;
    const b = hud.board.querySelector('#voltar');
    if (b) b.onclick = finish;
    saveResult();
  }

  /* Grava as estatísticas do jogador no ranking (uma vez por partida) */
  async function saveResult() {
    const mine = st.r.find((r) => r.id === me.id && !r.left);
    const el = hud.board.querySelector('#saved');
    if (!mine || !onResult) return;
    const ok = await onResult({
      matchId: st.mid,
      goals: mine.g,
      touches: mine.t,
      won: st.w === mine.team,
    }).catch(() => false);
    if (el) el.textContent = ok ? 'Estatísticas salvas no ranking.' : 'Não foi possível salvar no ranking.';
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
    for (const [id, text] of st.lg || [])
      if (!seenLog.has(id)) {
        seenLog.add(id);
        toast(text);
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
    leaving.forEach(clearTimeout);
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    supabase.removeChannel(ch);
  };
}
