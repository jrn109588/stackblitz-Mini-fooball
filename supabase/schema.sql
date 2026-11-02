-- Rode no SQL Editor do Supabase (projeto novo / sem tabelas do jogo).
-- Se você já rodou uma versão anterior, rode apenas o update-v2.sql e depois o update-v3.sql.

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null default upper(substr(md5(random()::text), 1, 6)),
  name text not null,
  mode int not null check (mode between 2 and 5),
  bots boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'playing')),
  field text not null default 'gramado' check (field in ('gramado', 'noturno', 'areia', 'quadra')),
  ball text not null default 'classica' check (ball in ('classica', 'laranja', 'neon', 'preta')),
  color_mode text not null default 'host' check (color_mode in ('host', 'captains')),
  host_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.lobby_players (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nickname text not null,
  team text not null check (team in ('red', 'blue')),
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id),
  unique (user_id)
);

create table public.lobby_teams (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  team text not null check (team in ('red', 'blue')),
  name text not null,
  c1 text not null,
  c2 text not null,
  pattern int not null default 0 check (pattern between 0 and 2),
  captain_id uuid references auth.users(id) on delete set null,
  primary key (lobby_id, team)
);

alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;
alter table public.lobby_teams enable row level security;

create policy "ver lobbies" on public.lobbies for select to authenticated using (true);
create policy "criar lobby" on public.lobbies for insert to authenticated with check (host_id = auth.uid());
create policy "host altera" on public.lobbies for update to authenticated using (host_id = auth.uid());
create policy "host apaga" on public.lobbies for delete to authenticated using (host_id = auth.uid());

create policy "ver jogadores" on public.lobby_players for select to authenticated using (true);
create policy "entrar" on public.lobby_players for insert to authenticated with check (user_id = auth.uid());
create policy "trocar time e visual" on public.lobby_players for update to authenticated using (user_id = auth.uid());
create policy "sair" on public.lobby_players for delete to authenticated using (user_id = auth.uid());

create policy "ver times" on public.lobby_teams for select to authenticated using (true);
create policy "host cria times" on public.lobby_teams for insert to authenticated
  with check (exists (select 1 from public.lobbies l where l.id = lobby_id and l.host_id = auth.uid()));
create policy "capitao ou host edita" on public.lobby_teams for update to authenticated
  using (captain_id = auth.uid() or exists (select 1 from public.lobbies l where l.id = lobby_id and l.host_id = auth.uid()))
  with check (true);

-- Ranking: estatísticas acumuladas por jogador.
-- Ninguém escreve direto nas tabelas: o cliente chama record_match(), que usa auth.uid().
create table if not exists public.player_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  goals int not null default 0,
  touches int not null default 0,
  matches int not null default 0,
  wins int not null default 0,
  updated_at timestamptz not null default now()
);

-- Evita contar a mesma partida duas vezes para o mesmo jogador
create table if not exists public.match_records (
  match_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.player_stats enable row level security;
alter table public.match_records enable row level security;

drop policy if exists "ver ranking" on public.player_stats;
create policy "ver ranking" on public.player_stats for select to authenticated using (true);

create or replace view public.player_leaderboard with (security_invoker = true) as
  select user_id, nickname, goals, touches, matches, wins,
         case when matches > 0 then round(100.0 * wins / matches, 1) else 0 end as win_rate
  from public.player_stats;

create or replace function public.record_match(
  p_match uuid, p_nickname text, p_goals int, p_touches int, p_won boolean
) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'não autenticado'; end if;
  insert into public.match_records (match_id, user_id) values (p_match, uid) on conflict do nothing;
  if not found then return; end if; -- partida já registrada

  insert into public.player_stats as s (user_id, nickname, goals, touches, matches, wins)
  values (uid, left(coalesce(nullif(trim(p_nickname), ''), 'Jogador'), 12),
          least(greatest(p_goals, 0), 30), least(greatest(p_touches, 0), 1500), 1,
          case when p_won then 1 else 0 end)
  on conflict (user_id) do update set
    nickname = excluded.nickname,
    goals = s.goals + excluded.goals,
    touches = s.touches + excluded.touches,
    matches = s.matches + 1,
    wins = s.wins + excluded.wins,
    updated_at = now();
end $$;

revoke all on function public.record_match(uuid, text, int, int, boolean) from public, anon;
grant execute on function public.record_match(uuid, text, int, int, boolean) to authenticated;
grant select on public.player_leaderboard to authenticated;

-- Realtime (a partida em si usa Broadcast, que não precisa de tabela)
alter publication supabase_realtime add table public.lobbies;
alter publication supabase_realtime add table public.lobby_players;
alter publication supabase_realtime add table public.lobby_teams;
