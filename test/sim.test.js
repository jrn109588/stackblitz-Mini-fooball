import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step, replaceWithBot, snapshot } from '../src/sim.js';

/* rng com seed para os testes serem reproduzíveis */
const seeded = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const host = { id: 'host', name: 'Host', team: 0 };

function play(sim, fps, seconds = 400) {
  const goals = [];
  let last = 0;
  for (let t = 0; sim.phase !== 'end' && t < seconds; t += 1 / fps) {
    step(sim, 1 / fps);
    const g = sim.score[0] + sim.score[1];
    if (g !== last) goals.push(180 - sim.time);
    last = g;
  }
  return goals;
}

test('5x5 com bots: sem loop de gols em várias taxas de FPS', () => {
  for (const fps of [30, 60, 75, 120, 144, 240])
    for (const humans of [[], [host]])
      for (let seed = 1; seed <= 3; seed++) {
        const sim = createSim(humans, 5, true, seeded(seed * 7919 + fps));
        const goals = play(sim, fps);
        assert.equal(sim.phase, 'end');
        // antes da correção: 17 a 61 gols; agora uma partida normal
        assert.ok(goals.length <= 15, `${goals.length} gols (fps ${fps}, seed ${seed})`);
        // loop = 4 intervalos seguidos praticamente idênticos entre gols
        const iv = goals.slice(1).map((x, i) => x - goals[i]);
        for (let i = 0; i + 3 < iv.length; i++)
          assert.ok(
            !iv.slice(i, i + 4).every((v) => Math.abs(v - iv[i]) < 0.15),
            `padrão repetido de gols (fps ${fps}, seed ${seed})`
          );
      }
});

test('após o gol, quem sofreu dá a saída e o outro time espera', () => {
  const sim = createSim([], 5, true, seeded(3));
  while (sim.phase !== 'goal') step(sim, 1 / 60);
  const conceded = 1 - sim.goalTeam;
  while (sim.phase === 'goal') step(sim, 1 / 60);
  assert.equal(sim.koTeam, conceded);
  const waiting = sim.players.filter((p) => p.team !== conceded);
  for (let i = 0; i < 30; i++) step(sim, 1 / 60); // 0,5 s
  for (const p of waiting) assert.ok(Math.hypot(p.x - p.home.x, p.y - p.home.y) < 5);
});

test('quem sai vira bot com o nome "Bot (nome)" e o aviso vai no snapshot', () => {
  const sim = createSim([host, { id: 'u2', name: 'Maria', team: 1 }], 2, true, seeded(1));
  const msg = replaceWithBot(sim, 'u2');
  assert.match(msg, /Maria saiu da partida/);
  const p = sim.players.find((q) => q.id === 'u2');
  assert.equal(p.name, 'Bot (Maria)');
  assert.equal(p.bot, true);
  assert.equal(replaceWithBot(sim, 'u2'), null); // não repete
  assert.equal(replaceWithBot(sim, 'bot-0-1'), null); // bots originais ignorados
  assert.ok(snapshot(sim).lg.some(([, t]) => t === msg));
  play(sim, 60);
  const row = sim.report.find((r) => r.id === 'u2');
  assert.equal(row.left, true);
  assert.equal(row.name, 'Bot (Maria)');
});

test('relatório final traz toques na bola e id da partida (para o ranking)', () => {
  const sim = createSim([host], 3, true, seeded(5));
  play(sim, 60);
  assert.match(snapshot(sim).mid, /^[0-9a-f-]{36}$/);
  assert.ok(sim.report.every((r) => Number.isInteger(r.t) && r.t >= 0));
  assert.ok(sim.report.reduce((s, r) => s + r.t, 0) > 0);
});
