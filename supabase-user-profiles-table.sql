-- ユーザープロファイルテーブル
-- Supabase SQL Editor で実行してください

create table if not exists user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

drop policy if exists "Profiles owner select" on user_profiles;
drop policy if exists "Profiles owner upsert" on user_profiles;
drop policy if exists "Profiles owner delete" on user_profiles;

-- 自分のデータのみ参照
create policy "Profiles owner select"
  on user_profiles
  for select
  using (auth.uid() = user_id);

-- 自分のデータのみ登録・更新
create policy "Profiles owner upsert"
  on user_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 自分のデータのみ削除
create policy "Profiles owner delete"
  on user_profiles
  for delete
  using (auth.uid() = user_id);
