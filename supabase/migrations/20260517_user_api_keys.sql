-- ユーザーごとの外部 AI API キー（OpenRouter / OpenAI）
-- RLS で本人のみアクセス可能。サービスロール経由でのみサーバ側から復号利用する想定。

CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  openrouter_key TEXT,
  openai_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_api_keys: own data only" ON user_api_keys;
CREATE POLICY "user_api_keys: own data only"
  ON user_api_keys FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
