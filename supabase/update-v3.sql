-- Rode no SQL Editor SE você já tinha rodado o schema.sql / update-v2.sql.
-- 1) Remove a personalização do jogador (pele, cabelo, estilo e número).
-- 2) Cria o ranking (player_stats, match_records, view player_leaderboard e a função record_match).

alter table public.lobby_players
  drop column if exists skin,
  drop column if exists hair_color,
  drop column if exists hair_style,
  drop column if exists number;

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
