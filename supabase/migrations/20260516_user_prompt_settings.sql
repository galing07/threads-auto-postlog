-- ユーザーごとのカスタムプロンプト設定
-- 既存のシステムプロンプトに「追加指示」として混ぜる

CREATE TABLE IF NOT EXISTS user_prompt_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  text_extra TEXT,
  image_extra TEXT,
  themes_extra TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_prompt_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_prompt_settings: own data only" ON user_prompt_settings;
CREATE POLICY "user_prompt_settings: own data only"
  ON user_prompt_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
