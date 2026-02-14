-- フィードバック（ご意見・不具合報告）テーブル
-- Supabase SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  body TEXT NOT NULL,
  created_by_email TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at);
CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id ON feedbacks(user_id);

ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;

-- ログインユーザーは自分のフィードバックのみ参照可能（任意）
CREATE POLICY "Users can read own feedbacks"
  ON feedbacks FOR SELECT
  USING (auth.uid() = user_id);

-- ログインユーザーはフィードバックを投稿可能（user_id は自分でなければならない）
CREATE POLICY "Authenticated users can insert feedbacks"
  ON feedbacks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = auth.uid()));
