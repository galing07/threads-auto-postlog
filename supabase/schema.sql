-- ============================================
-- SNS Auto Post - Supabase Schema
-- ============================================

-- アカウント管理
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'threads'
    CHECK (platform IN ('threads', 'instagram', 'x')),
  name TEXT NOT NULL,
  persona TEXT,
  tone TEXT DEFAULT 'friendly',
  target_audience TEXT,
  post_topics TEXT[],
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  -- Threads
  threads_user_id TEXT,
  threads_client_id TEXT,
  threads_client_secret TEXT,
  -- Instagram
  instagram_user_id TEXT,
  -- X
  x_user_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿管理
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  text_content TEXT,
  image_url TEXT,
  image_prompt TEXT,
  theme TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'publishing', 'posted', 'failed')),
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT,
  platform_post_ids TEXT[],
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 参考アカウント
CREATE TABLE reference_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'threads'
    CHECK (platform IN ('threads', 'instagram', 'x')),
  handle TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿テーマ
CREATE TABLE post_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  theme TEXT NOT NULL,
  description TEXT,
  example_post TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザーごとの外部 AI API キー（OpenRouter / OpenAI）
CREATE TABLE user_api_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  openrouter_key TEXT,
  openai_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- アカウントごとのカスタムプロンプト設定
-- 既存のシステムプロンプトに「追加指示」として混ぜる
CREATE TABLE account_prompt_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  -- 全文編集方式: NULL ならデフォルトテンプレ、値ありならその全文を使用
  text_prompt TEXT,
  image_prompt TEXT,
  themes_prompt TEXT,
  -- 旧・追加指示方式（後方互換のため残置・新方式では未使用）
  text_extra TEXT,
  image_extra TEXT,
  themes_extra TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿ログ
CREATE TABLE post_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('generated', 'approved', 'posted', 'failed')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX idx_accounts_user_id        ON accounts (user_id);
CREATE INDEX idx_posts_user_id           ON posts (user_id);
CREATE INDEX idx_posts_account_created   ON posts (account_id, created_at DESC);
CREATE INDEX idx_posts_status            ON posts (status);
CREATE INDEX idx_reference_accounts_user ON reference_accounts (user_id);
CREATE INDEX idx_post_themes_account     ON post_themes (account_id);
CREATE INDEX idx_post_logs_post_id       ON post_logs (post_id);

-- ============================================
-- RLS（Row Level Security）ポリシー
-- ============================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_api_keys: own data only"
  ON user_api_keys FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE account_prompt_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_prompt_settings: own accounts only"
  ON account_prompt_settings FOR ALL
  USING (
    account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  );

-- reference_accounts: 自分のもののみ
CREATE POLICY "reference_accounts: own data only"
  ON reference_accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- accounts: 自分のアカウントのみ
CREATE POLICY "accounts: own data only"
  ON accounts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- posts: user_id 一致、または account_id 経由で自分のものに紐づく投稿のみ
CREATE POLICY "posts: own data only"
  ON posts FOR ALL
  USING (
    user_id = auth.uid()
    OR account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  );

-- post_themes: 自分のアカウントのテーマのみ
CREATE POLICY "post_themes: own accounts only"
  ON post_themes FOR ALL
  USING (
    account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  );

-- post_logs: 自分の投稿のログのみ
-- ※ posts.user_id 単独所有（account_id=NULL のデモ投稿）でも見えるよう、posts 側 RLS と整合させる
CREATE POLICY "post_logs: own posts only"
  ON post_logs FOR ALL
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE user_id = auth.uid()
         OR account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE user_id = auth.uid()
         OR account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
    )
  );

-- ============================================
-- updated_at 自動更新トリガー
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- レート制限（固定ウィンドウ）
-- ============================================

CREATE TABLE rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- ポリシー無し = service_role 以外アクセス不可

CREATE INDEX idx_rate_limits_window ON rate_limits (window_start);

CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id UUID,
  p_bucket TEXT,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );
  INSERT INTO rate_limits (user_id, bucket, window_start, count)
  VALUES (p_user_id, p_bucket, v_window_start, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;
