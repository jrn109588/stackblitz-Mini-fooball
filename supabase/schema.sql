-- Rode no SQL Editor do Supabase (projeto novo / sem tabelas do jogo).
-- Se você já rodou a versão anterior, rode apenas supabase/update-v2.sql.

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
  skin int not null default 1 check (skin between 0 and 5),
  hair_color int not null default 0 check (hair_color between 0 and 5),
  hair_style int not null default 1 check (hair_style between 0 and 3),
  number int not null default 10 check (number between 1 and 99),
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

-- Realtime (a partida em si usa Broadcast, que não precisa de tabela)
alter publication supabase_realtime add table public.lobbies;
alter publication supabase_realtime add table public.lobby_players;
alter publication supabase_realtime add table public.lobby_teams;
