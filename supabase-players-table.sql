-- プレイヤー管理テーブル
-- Supabase SQL Editor で実行してください

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table players enable row level security;

-- 既存ポリシーがある場合は一度削除
drop policy if exists "Players owner select" on players;
drop policy if exists "Players owner insert" on players;
drop policy if exists "Players owner delete" on players;

-- 自分のデータのみ参照
create policy "Players owner select"
  on players
  for select
  using (auth.uid() = user_id);

-- 自分のデータのみ追加
create policy "Players owner insert"
  on players
  for insert
  with check (auth.uid() = user_id);

-- 自分のデータのみ削除
create policy "Players owner delete"
  on players
  for delete
  using (auth.uid() = user_id);
