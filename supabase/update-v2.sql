-- Rode no SQL Editor SE você já tinha rodado o schema.sql anterior.
-- Adiciona campo/bola/modo de cores, visual do boneco e a tabela de times (capitão e cores).

alter table public.lobbies
  add column if not exists field text not null default 'gramado' check (field in ('gramado', 'noturno', 'areia', 'quadra')),
  add column if not exists ball text not null default 'classica' check (ball in ('classica', 'laranja', 'neon', 'preta')),
  add column if not exists color_mode text not null default 'host' check (color_mode in ('host', 'captains'));

alter table public.lobby_players
  add column if not exists skin int not null default 1 check (skin between 0 and 5),
  add column if not exists hair_color int not null default 0 check (hair_color between 0 and 5),
  add column if not exists hair_style int not null default 1 check (hair_style between 0 and 3),
  add column if not exists number int not null default 10 check (number between 1 and 99);

create table if not exists public.lobby_teams (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  team text not null check (team in ('red', 'blue')),
  name text not null,
  c1 text not null,
  c2 text not null,
  pattern int not null default 0 check (pattern between 0 and 2),
  captain_id uuid references auth.users(id) on delete set null,
  primary key (lobby_id, team)
);

alter table public.lobby_teams enable row level security;

create policy "ver times" on public.lobby_teams for select to authenticated using (true);
create policy "host cria times" on public.lobby_teams for insert to authenticated
  with check (exists (select 1 from public.lobbies l where l.id = lobby_id and l.host_id = auth.uid()));
create policy "capitao ou host edita" on public.lobby_teams for update to authenticated
  using (captain_id = auth.uid() or exists (select 1 from public.lobbies l where l.id = lobby_id and l.host_id = auth.uid()))
  with check (true);

alter publication supabase_realtime add table public.lobby_teams;

-- Lobbies antigos não têm linhas em lobby_teams: apague-os (os novos já nascem completos).
delete from public.lobbies;
