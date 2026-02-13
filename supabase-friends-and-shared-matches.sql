-- フレンド機能・対局共有機能
-- Supabase SQL Editor で実行してください

-- ============================================================
-- 1. user_profiles に friend_code を追加
-- ============================================================
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS friend_code TEXT UNIQUE;

-- 8文字のランダム英数字を生成する関数
CREATE OR REPLACE FUNCTION generate_friend_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 紛らわしい文字を除外
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- friend_code が NULL の既存レコードに値を設定
DO $$
DECLARE
  r RECORD;
  new_code TEXT;
  done BOOLEAN;
BEGIN
  FOR r IN SELECT user_id FROM user_profiles WHERE friend_code IS NULL
  LOOP
    done := FALSE;
    WHILE NOT done LOOP
      new_code := generate_friend_code();
      BEGIN
        UPDATE user_profiles SET friend_code = new_code WHERE user_id = r.user_id;
        done := TRUE;
      EXCEPTION WHEN unique_violation THEN
        NULL;  -- 衝突したら再試行
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- 新規プロフィール作成時に friend_code を自動設定するトリガー
CREATE OR REPLACE FUNCTION set_friend_code_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  done BOOLEAN := FALSE;
BEGIN
  IF NEW.friend_code IS NULL OR NEW.friend_code = '' THEN
    WHILE NOT done LOOP
      new_code := generate_friend_code();
      BEGIN
        NEW.friend_code := new_code;
        done := TRUE;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_friend_code ON user_profiles;
CREATE TRIGGER trigger_set_friend_code
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_friend_code_on_insert();

-- ============================================================
-- 2. friends テーブル（新規）
-- ============================================================
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- 自分が申請者または申請先のレコードのみ参照可能
DROP POLICY IF EXISTS "Friends select own" ON friends;
CREATE POLICY "Friends select own"
  ON friends FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- 自分が user_id（申請者）としてのみ挿入可能
DROP POLICY IF EXISTS "Friends insert as requester" ON friends;
CREATE POLICY "Friends insert as requester"
  ON friends FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 自分が friend_id（申請された側）のときのみ更新可能（承認用）
DROP POLICY IF EXISTS "Friends update as requested" ON friends;
CREATE POLICY "Friends update as requested"
  ON friends FOR UPDATE
  USING (auth.uid() = friend_id)
  WITH CHECK (auth.uid() = friend_id);

-- 自分が関係するレコードのみ削除可能
DROP POLICY IF EXISTS "Friends delete own" ON friends;
CREATE POLICY "Friends delete own"
  ON friends FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- ============================================================
-- 3. shared_matches テーブル（新規）
-- ============================================================
CREATE TABLE IF NOT EXISTS shared_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(match_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_matches_shared_with ON shared_matches(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_shared_matches_owner ON shared_matches(owner_id);
CREATE INDEX IF NOT EXISTS idx_shared_matches_match ON shared_matches(match_id);

ALTER TABLE shared_matches ENABLE ROW LEVEL SECURITY;

-- 共有先または共有元の自分に関わるレコードのみ参照可能
DROP POLICY IF EXISTS "Shared matches select own" ON shared_matches;
CREATE POLICY "Shared matches select own"
  ON shared_matches FOR SELECT
  USING (auth.uid() = shared_with_user_id OR auth.uid() = owner_id);

-- 共有元（owner）としてのみ挿入可能
DROP POLICY IF EXISTS "Shared matches insert as owner" ON shared_matches;
CREATE POLICY "Shared matches insert as owner"
  ON shared_matches FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- 共有元または共有先が自分なら削除可能
DROP POLICY IF EXISTS "Shared matches delete own" ON shared_matches;
CREATE POLICY "Shared matches delete own"
  ON shared_matches FOR DELETE
  USING (auth.uid() = owner_id OR auth.uid() = shared_with_user_id);

-- ============================================================
-- 4. matches の RLS に「共有された対局」の読み取りを追加
-- ============================================================
DROP POLICY IF EXISTS "Users can read shared matches" ON matches;
CREATE POLICY "Users can read shared matches"
  ON matches FOR SELECT
  USING (
    id IN (
      SELECT match_id FROM shared_matches
      WHERE shared_with_user_id = auth.uid()
    )
  );

-- ============================================================
-- 5. フレンドコードでユーザーを検索する RPC（RLS 回避）
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_by_friend_code(code TEXT)
RETURNS TABLE(user_id UUID, display_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT up.user_id, up.display_name
  FROM user_profiles up
  WHERE up.friend_code = upper(trim(code))
    AND up.user_id != auth.uid();  -- 自分自身は返さない
END;
$$;

-- ============================================================
-- 6. user_profiles: フレンド関係にあるユーザーのプロフィール参照を許可
-- ============================================================
-- フレンド申請・承認済みユーザーの display_name 取得のため
DROP POLICY IF EXISTS "Profiles readable by friends" ON user_profiles;
CREATE POLICY "Profiles readable by friends"
  ON user_profiles FOR SELECT
  USING (
    user_id IN (
      SELECT friend_id FROM friends WHERE user_id = auth.uid()
      UNION
      SELECT user_id FROM friends WHERE friend_id = auth.uid()
    )
  );
