import './style.css';
import { supabase } from './supabase.js';
import {
  startGame,
  drawPlayer,
  SKINS,
  HAIR_COLORS,
  HAIR_STYLES,
  PATTERNS,
  FIELDS,
  BALLS,
  colorDist,
} from './game.js';

const $ = (s) => document.querySelector(s);
const app = $('#app');
const esc = (t = '') =>
  String(t).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[
        c
      ])
  );

const DEF_LOOK = { skin: 1, hair_color: 0, hair_style: 1, number: 10 };
const DEF_TEAMS = [
  {
    team: 'red',
    name: 'Vermelho',
    c1: '#e5484d',
    c2: '#ffffff',
    pattern: 0,
    captain_id: null,
  },
  {
    team: 'blue',
    name: 'Azul',
    c1: '#3e63dd',
    c2: '#ffffff',
    pattern: 0,
    captain_id: null,
  },
];

let user = null,
  lobby = null,
  players = [],
  teams = {},
  stopGame = null,
  subs = [],
  gameToken = 0,
  pendingRender = false;

const T = (t) => teams[t] || DEF_TEAMS.find((d) => d.team === t);
const nick = () => user.user_metadata?.nickname || user.email.split('@')[0];
const myLook = () => ({ ...DEF_LOOK, ...(user.user_metadata?.look || {}) });
const notice = (m) => {
  const el = $('#msg');
  if (el) el.textContent = m;
};
const unsub = () => {
  subs.forEach((c) => supabase.removeChannel(c));
  subs = [];
};
const exitGame = () => {
  gameToken++;
  if (stopGame) {
    stopGame();
    stopGame = null;
  }
};

/* ---------- Autenticação ---------- */
async function boot() {
  const { data } = await supabase.auth.getSession();
  user = data.session?.user ?? null;
  supabase.auth.onAuthStateChange((_e, s) => {
    const u = s?.user ?? null;
    if (u?.id !== user?.id) {
      user = u;
      go();
    }
  });
  go();
}
const go = () => (user ? showList() : showAuth());

function showAuth() {
  exitGame();
  unsub();
  lobby = null;
  app.innerHTML = `
  <main class="center">
    <h1>Mini Soccer</h1>
    <p class="sub">Entre ou crie uma conta para jogar</p>
    <form id="auth" class="card col">
      <input name="nickname" placeholder="Apelido (usado no cadastro)" maxlength="12" />
      <input type="email" name="email" placeholder="E-mail" required />
      <input type="password" name="senha" placeholder="Senha (mín. 6)" minlength="6" required />
      <div class="row"><button data-modo="login">Entrar</button><button data-modo="cadastro" class="sec">Cadastrar</button></div>
      <p id="msg"></p>
    </form>
  </main>`;
  $('#auth').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } =
      e.submitter.dataset.modo === 'cadastro'
        ? await supabase.auth.signUp({
            email: f.email,
            password: f.senha,
            options: {
              data: {
                nickname: (f.nickname || f.email.split('@')[0]).slice(0, 12),
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            email: f.email,
            password: f.senha,
          });
    if (error) notice(error.message);
  };
}

/* ---------- Lista de lobbies ---------- */
async function leaveCurrent() {
  await supabase.from('lobby_players').delete().eq('user_id', user.id);
  await supabase.from('lobbies').delete().eq('host_id', user.id);
}

async function showList() {
  exitGame();
  unsub();
  lobby = null;
  app.innerHTML = `
  <header><h1>Mini Soccer</h1><div class="row"><span>${esc(
    nick()
  )}</span><button id="sair" class="sec">Sair</button></div></header>
  <main class="grid2">
    <section class="card col">
      <h2>Criar lobby</h2>
      <input id="nome" placeholder="Nome do lobby" maxlength="24" value="Lobby de ${esc(
        nick()
      )}" />
      <select id="modo"><option value="2">2x2</option><option value="3">3x3</option><option value="4">4x4</option><option value="5">5x5</option></select>
      <label class="check"><input type="checkbox" id="bots" /> Completar vagas com bots</label>
      <button id="criar">Criar lobby</button>
      <h2>Entrar com código</h2>
      <div class="row"><input id="codigo" placeholder="Código" maxlength="6" /><button id="entrar" class="sec">Entrar</button></div>
      <p id="msg"></p>
    </section>
    <section class="card col"><h2>Lobbies abertos</h2><div id="lista" class="col"></div></section>
  </main>`;
  $('#sair').onclick = () => supabase.auth.signOut();
  $('#criar').onclick = createLobby;
  $('#entrar').onclick = async () => {
    const code = $('#codigo').value.trim().toUpperCase();
    const { data } = await supabase
      .from('lobbies')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    data ? joinLobby(data.id) : notice('Código não encontrado.');
  };
  $('#lista').onclick = (e) =>
    e.target.dataset.join && joinLobby(e.target.dataset.join);
  let t;
  const reload = () => {
    clearTimeout(t);
    t = setTimeout(loadList, 300);
  };
  subs.push(
    supabase
      .channel('list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies' },
        reload
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_players' },
        reload
      )
      .subscribe()
  );
  loadList();
}

async function loadList() {
  const since = new Date(Date.now() - 3 * 3600e3).toISOString();
  const { data, error } = await supabase
    .from('lobbies')
    .select('*, lobby_players(count)')
    .eq('status', 'waiting')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30);
  const el = $('#lista');
  if (!el) return;
  if (error) return notice(error.message);
  el.innerHTML = data.length
    ? data
        .map(
          (l) =>
            `<div class="item"><div><b>${esc(l.name)}</b><small>${l.mode}x${
              l.mode
            }${l.bots ? ' · com bots' : ''} · ${
              l.lobby_players[0]?.count ?? 0
            }/${l.mode * 2} · código ${
              l.code
            }</small></div><button data-join="${l.id}">Entrar</button></div>`
        )
        .join('')
    : '<p class="vazio">Nenhum lobby aberto. Crie o primeiro!</p>';
}

async function createLobby() {
  const name = $('#nome').value.trim() || 'Lobby';
  await leaveCurrent();
  const { data, error } = await supabase
    .from('lobbies')
    .insert({ name, mode: +$('#modo').value, bots: $('#bots').checked })
    .select()
    .single();
  if (error) return notice(error.message);
  const { error: e2 } = await supabase
    .from('lobby_players')
    .insert({ lobby_id: data.id, nickname: nick(), team: 'red', ...myLook() });
  if (e2) return notice(e2.message);
  const rows = DEF_TEAMS.map((d) => ({
    ...d,
    lobby_id: data.id,
    captain_id: d.team === 'red' ? user.id : null,
  }));
  const { error: e3 } = await supabase.from('lobby_teams').insert(rows);
  if (e3) return notice(e3.message);
  openRoom(data.id);
}

async function joinLobby(id) {
  const { data: l } = await supabase
    .from('lobbies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!l) return notice('Lobby não encontrado.');
  if (l.status !== 'waiting') return notice('Partida já em andamento.');
  const { data: ps } = await supabase
    .from('lobby_players')
    .select('team, user_id')
    .eq('lobby_id', id);
  const red = ps.filter((p) => p.team === 'red').length,
    blue = ps.length - red;
  const already = ps.some((p) => p.user_id === user.id);
  if (!already && red >= l.mode && blue >= l.mode)
    return notice('Lobby cheio.');
  if (!already) {
    await leaveCurrent();
    const team =
      red <= blue && red < l.mode ? 'red' : blue < l.mode ? 'blue' : 'red';
    const { error } = await supabase
      .from('lobby_players')
      .insert({ lobby_id: id, nickname: nick(), team, ...myLook() });
    if (error) return notice(error.message);
  }
  openRoom(id);
}

/* ---------- Sala do lobby ---------- */
async function loadPlayers() {
  const { data } = await supabase
    .from('lobby_players')
    .select('*')
    .eq('lobby_id', lobby.id)
    .order('joined_at');
  players = data ?? [];
}
async function loadTeams() {
  const { data } = await supabase
    .from('lobby_teams')
    .select('*')
    .eq('lobby_id', lobby.id);
  teams = Object.fromEntries((data ?? []).map((t) => [t.team, t]));
}

/* O host garante que cada time tenha capitão: quem entrou primeiro no time */
async function ensureCaptains() {
  if (!lobby || lobby.host_id !== user.id) return;
  for (const team of ['red', 'blue']) {
    const row = teams[team];
    if (!row) continue;
    const members = players.filter((p) => p.team === team);
    if (members.some((p) => p.user_id === row.captain_id)) continue;
    const next = members[0]?.user_id ?? null;
    if (next !== row.captain_id)
      await supabase
        .from('lobby_teams')
        .update({ captain_id: next })
        .eq('lobby_id', lobby.id)
        .eq('team', team);
  }
}

async function openRoom(id) {
  unsub();
  const { data } = await supabase
    .from('lobbies')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!data) return showList();
  lobby = data;
  await Promise.all([loadPlayers(), loadTeams()]);
  await ensureCaptains();
  subs.push(
    supabase
      .channel('room-' + id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobbies' },
        onLobbyEvent
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_players' },
        async () => {
          if (!lobby) return;
          await loadPlayers();
          await ensureCaptains();
          requestRender();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lobby_teams' },
        async () => {
          if (!lobby) return;
          await loadTeams();
          requestRender();
        }
      )
      .subscribe()
  );
  lobby.status === 'playing' ? enterGame() : showRoom();
}

function onLobbyEvent(p) {
  if (!lobby) return;
  if (p.eventType === 'DELETE') {
    if (p.old.id === lobby.id) {
      alert('O host encerrou o lobby.');
      showList();
    }
    return;
  }
  if (p.new.id !== lobby.id) return;
  const was = lobby.status;
  lobby = p.new;
  if (lobby.status === 'playing' && was !== 'playing') enterGame();
  else if (lobby.status === 'waiting' && was === 'playing') {
    exitGame();
    showRoom();
  } else requestRender();
}

/* Não redesenha a sala enquanto alguém está digitando/escolhendo num campo */
function requestRender() {
  if (stopGame || !lobby || lobby.status === 'playing') return;
  const a = document.activeElement;
  if (
    a &&
    a.closest &&
    a.closest('.room') &&
    ['INPUT', 'SELECT'].includes(a.tagName)
  ) {
    pendingRender = true;
    return;
  }
  showRoom();
}
app.addEventListener('focusout', () => {
  if (pendingRender) {
    pendingRender = false;
    setTimeout(requestRender, 60);
  }
});

function showRoom() {
  const isHost = lobby.host_id === user.id;
  const mine = players.find((p) => p.user_id === user.id);
  const iAmCap = (t) => T(t).captain_id === user.id;
  const canEdit = (t) => (lobby.color_mode === 'captains' ? iAmCap(t) : isHost);
  const hd = isHost ? '' : 'disabled';

  const col = (team) => {
    const t = T(team);
    const list = players.filter((p) => p.team === team);
    const slots = Array.from({ length: lobby.mode }, (_, i) => {
      const p = list[i];
      if (!p)
        return `<li class="vaga">${lobby.bots ? 'Bot' : 'Vaga livre'}</li>`;
      const cap = t.captain_id === p.user_id;
      const give =
        iAmCap(team) && p.user_id !== user.id
          ? `<button class="mini" data-give="${p.user_id}" data-t="${team}">Dar braçadeira</button>`
          : '';
      return `<li class="${p.user_id === user.id ? 'me' : ''}"><span>${esc(
        p.nickname
      )}${p.user_id === lobby.host_id ? ' (host)' : ''}${
        cap ? ' <b class="cap">C</b>' : ''
      }</span>${give}</li>`;
    }).join('');
    const swap = mine && mine.team !== team;
    return `<div class="team" style="border-color:${t.c1}"><h3>${esc(
      t.name
    )} (${list.length}/${lobby.mode})</h3><ul>${slots}</ul>${
      swap
        ? `<button data-team="${team}" ${
            list.length < lobby.mode ? '' : 'disabled'
          }>Ir para este time</button>`
        : ''
    }</div>`;
  };

  const editor = (team) => {
    const t = T(team),
      dis = canEdit(team) ? '' : 'disabled';
    return `<div class="tedit"><h4>${esc(t.name)}</h4>
      <label>Nome<input data-te="${team}:name" value="${esc(
      t.name
    )}" maxlength="14" ${dis} /></label>
      <label>Cor principal<input type="color" data-te="${team}:c1" value="${
      t.c1
    }" ${dis} /></label>
      <label>Cor secundária<input type="color" data-te="${team}:c2" value="${
      t.c2
    }" ${dis} /></label>
      <label>Estampa<select data-te="${team}:pattern" ${dis}>${PATTERNS.map(
      (n, i) =>
        `<option value="${i}" ${
          t.pattern === i ? 'selected' : ''
        }>${n}</option>`
    ).join('')}</select></label></div>`;
  };

  const sw = (key, arr, cur) =>
    arr
      .map(
        (c, i) =>
          `<button class="sw ${
            cur === i ? 'on' : ''
          }" data-look="${key}" data-v="${i}" style="background:${c}" aria-label="opção ${
            i + 1
          }"></button>`
      )
      .join('');
  const opts = (obj, cur) =>
    Object.entries(obj)
      .map(
        ([k, v]) =>
          `<option value="${k}" ${cur === k ? 'selected' : ''}>${
            v.label
          }</option>`
      )
      .join('');
  const colorHint =
    lobby.color_mode === 'captains'
      ? 'As cores de cada time são escolhidas pelo capitão.'
      : 'As cores dos dois times são escolhidas pelo dono do lobby.';

  app.innerHTML = `
  <header><h1>${esc(lobby.name)}</h1><div class="row"><span>${lobby.mode}x${
    lobby.mode
  } · código <b>${
    lobby.code
  }</b></span><button id="sairl" class="sec">Sair do lobby</button></div></header>
  <main class="room">
    <div class="teams">${col('red')}${col('blue')}</div>
    <div class="cfg-grid">
      <section class="card col">
        <h2>Meu boneco</h2>
        <canvas id="prev" width="140" height="140"></canvas>
        <div class="swrow"><span>Pele</span>${sw(
          'skin',
          SKINS,
          mine?.skin
        )}</div>
        <div class="swrow"><span>Cabelo</span>${sw(
          'hair_color',
          HAIR_COLORS,
          mine?.hair_color
        )}</div>
        <label>Estilo<select data-look="hair_style">${HAIR_STYLES.map(
          (n, i) =>
            `<option value="${i}" ${
              mine?.hair_style === i ? 'selected' : ''
            }>${n}</option>`
        ).join('')}</select></label>
        <label>Número<input type="number" min="1" max="99" data-look="number" value="${
          mine?.number ?? 10
        }" /></label>
      </section>
      <section class="card col">
        <h2>Partida</h2>
        <label>Campo<select data-lb="field" ${hd}>${opts(
    FIELDS,
    lobby.field
  )}</select></label>
        <label>Bola<select data-lb="ball" ${hd}>${opts(
    BALLS,
    lobby.ball
  )}</select></label>
        <label>Quem escolhe as cores<select data-lb="color_mode" ${hd}><option value="host" ${
    lobby.color_mode === 'host' ? 'selected' : ''
  }>Dono do lobby</option><option value="captains" ${
    lobby.color_mode === 'captains' ? 'selected' : ''
  }>Capitães</option></select></label>
        <p class="sub">${
          isHost
            ? 'Só você (dono do lobby) altera campo, bola e o modo de cores.'
            : 'Campo, bola e modo de cores são definidos pelo dono do lobby.'
        }</p>
      </section>
      <section class="card col">
        <h2>Times</h2>
        <p class="sub">${colorHint} O capitão usa uma faixa preta na diagonal e pode passar a braçadeira a alguém do time.</p>
        ${editor('red')}${editor('blue')}
      </section>
    </div>
    ${
      isHost
        ? '<button id="iniciar" class="big">Iniciar partida</button>'
        : '<p class="sub">Aguardando o host iniciar a partida...</p>'
    }
    <p class="sub">Controles: WASD ou setas para mover, Espaço para chutar. Partida de 3 minutos.</p>
    <p id="msg"></p>
  </main>`;
  $('#sairl').onclick = leaveRoom;
  if (isHost) $('#iniciar').onclick = startMatch;
  drawPreview();
}

function drawPreview() {
  const c = $('#prev'),
    mine = players.find((p) => p.user_id === user.id);
  if (!c || !mine) return;
  const t = T(mine.team),
    ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 140, 140);
  ctx.save();
  ctx.scale(1.5, 1.5);
  drawPlayer(ctx, 46, 46, {
    c1: t.c1,
    c2: t.c2,
    pat: t.pattern,
    look: {
      skin: mine.skin,
      hairColor: mine.hair_color,
      hairStyle: mine.hair_style,
      number: mine.number,
    },
    face: { dx: 0.7, dy: 0.7 },
    captain: t.captain_id === user.id,
    me: false,
  });
  ctx.restore();
}

async function updateLook(patch) {
  const { error } = await supabase
    .from('lobby_players')
    .update(patch)
    .eq('user_id', user.id)
    .eq('lobby_id', lobby.id);
  if (error) return notice(error.message);
  const look = { ...myLook(), ...patch };
  user.user_metadata = { ...user.user_metadata, look };
  supabase.auth.updateUser({ data: { look } });
}

app.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !lobby) return;
  let error;
  if (b.dataset.team)
    ({ error } = await supabase
      .from('lobby_players')
      .update({ team: b.dataset.team })
      .eq('user_id', user.id)
      .eq('lobby_id', lobby.id));
  else if (b.dataset.give)
    ({ error } = await supabase
      .from('lobby_teams')
      .update({ captain_id: b.dataset.give })
      .eq('lobby_id', lobby.id)
      .eq('team', b.dataset.t));
  else if (b.dataset.look)
    return updateLook({ [b.dataset.look]: +b.dataset.v });
  if (error) notice(error.message);
});

app.addEventListener('change', async (e) => {
  const el = e.target;
  if (!lobby) return;
  let error;
  if (el.dataset.look) {
    const num = el.type === 'number';
    return updateLook({
      [el.dataset.look]: Math.max(
        num ? 1 : 0,
        Math.min(num ? 99 : 9, Math.round(+el.value) || (num ? 10 : 0))
      ),
    });
  }
  if (el.dataset.lb)
    ({ error } = await supabase
      .from('lobbies')
      .update({ [el.dataset.lb]: el.value })
      .eq('id', lobby.id));
  else if (el.dataset.te) {
    const [team, key] = el.dataset.te.split(':');
    const val = key === 'pattern' ? +el.value : el.value.trim();
    if (key === 'name' && !val) return;
    ({ error } = await supabase
      .from('lobby_teams')
      .update({ [key]: val })
      .eq('lobby_id', lobby.id)
      .eq('team', team));
  }
  if (error) notice(error.message);
});

async function startMatch() {
  const red = players.filter((p) => p.team === 'red').length,
    blue = players.length - red;
  if (!lobby.bots && (red < 1 || blue < 1))
    return notice(
      'Cada time precisa de ao menos 1 jogador, ou crie o lobby com bots.'
    );
  if (colorDist(T('red').c1, T('blue').c1) < 90)
    return notice(
      'As cores principais dos times estão muito parecidas. Mude uma delas.'
    );
  const { error } = await supabase
    .from('lobbies')
    .update({ status: 'playing' })
    .eq('id', lobby.id);
  if (error) notice(error.message);
}

/* ---------- Partida ---------- */
async function enterGame() {
  exitGame();
  const token = gameToken;
  await Promise.all([loadPlayers(), loadTeams()]);
  if (token !== gameToken || !lobby || lobby.status !== 'playing') return;
  const isHost = lobby.host_id === user.id;
  app.innerHTML = `
  <main class="gamewrap">
    <div class="hud"><span class="tag" id="rt"><span id="rn">Vermelho</span> <b id="hr">0</b></span><span id="ht" class="timer">3:00</span><span class="tag" id="bt"><b id="hb">0</b> <span id="bn">Azul</span></span></div>
    <div class="stage"><canvas id="cv"></canvas><div id="board" class="board" hidden></div></div>
    <div class="bar"><span>Mover: WASD ou setas. Chutar: Espaço.</span><button id="sairj" class="sec">Sair da partida</button></div>
  </main>`;
  const looks = {};
  players.forEach((p) => {
    looks[p.user_id] = {
      skin: p.skin,
      hairColor: p.hair_color,
      hairStyle: p.hair_style,
      number: p.number,
    };
  });
  const config = {
    field: lobby.field,
    ball: lobby.ball,
    looks,
    teams: ['red', 'blue'].map((t) => ({
      name: T(t).name,
      c1: T(t).c1,
      c2: T(t).c2,
      pat: T(t).pattern,
    })),
    captains: ['red', 'blue'].map((t) => T(t).captain_id),
  };
  const roster = players.map((p) => ({
    id: p.user_id,
    name: p.nickname,
    team: p.team === 'red' ? 0 : 1,
  }));
  stopGame = startGame({
    canvas: $('#cv'),
    lobby,
    roster,
    me: user,
    isHost,
    config,
    hud: {
      red: $('#hr'),
      blue: $('#hb'),
      time: $('#ht'),
      redTag: $('#rt'),
      blueTag: $('#bt'),
      redName: $('#rn'),
      blueName: $('#bn'),
      board: $('#board'),
    },
    onEnd: () =>
      supabase.from('lobbies').update({ status: 'waiting' }).eq('id', lobby.id),
  });
  $('#sairj').onclick = leaveRoom;
}

async function leaveRoom() {
  exitGame();
  unsub();
  lobby = null;
  await leaveCurrent();
  showList();
}

boot();
