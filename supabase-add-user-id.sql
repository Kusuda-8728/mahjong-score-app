-- matches テーブルに user_id カラムを追加
-- Supabase SQL Editor で実行してください
-- ※ 既存の RLS ポリシーがある場合は、先に削除してから実行するか、ポリシーを後から更新してください

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 既存データがある場合、user_id は NULL のままになります
-- 必要に応じて手動で紐付けするか、新規データからのみ user_id を設定してください
