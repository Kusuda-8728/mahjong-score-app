-- RLS ポリシー: ログインしたユーザーが自分のデータだけを読み書きできる
-- Supabase SQL Editor で実行してください

-- 既存の全許可ポリシーを削除（以前の "Allow all for matches" など）
DROP POLICY IF EXISTS "Allow all for matches" ON matches;

-- RLS が有効であることを確認
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- 自分のデータのみ SELECT 可能
CREATE POLICY "Users can read own matches"
  ON matches
  FOR SELECT
  USING (auth.uid() = user_id);

-- 自分のデータのみ INSERT 可能（user_id は現在のユーザーと一致させる）
CREATE POLICY "Users can insert own matches"
  ON matches
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 自分のデータのみ UPDATE 可能
CREATE POLICY "Users can update own matches"
  ON matches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 自分のデータのみ DELETE 可能
CREATE POLICY "Users can delete own matches"
  ON matches
  FOR DELETE
  USING (auth.uid() = user_id);
