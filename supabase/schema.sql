-- ============================================
-- SNS Auto Post - Supabase Schema
-- ============================================

-- アカウント管理
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'threads', -- 'threads' | 'tiktok' | 'instagram' | 'x'
  name TEXT NOT NULL,
  persona TEXT, -- ペルソナ設定（転職ノウハウ系/プロ目線系/体験談系）
  tone TEXT DEFAULT 'friendly', -- 文体トーン
  target_audience TEXT, -- ターゲット（例：高卒20代キャリア不安層）
  post_topics TEXT[], -- 発信テーマ一覧
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  threads_user_id TEXT, -- ThreadsのユーザーID
  threads_client_id TEXT, -- Meta App Client ID（アカウント単位で保管）
  threads_client_secret TEXT, -- Meta App Client Secret（同上 / RLS で保護）
  instagram_user_id TEXT, -- Instagram Business Account ID
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿管理
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE, -- アカウントなしのデモ生成も追跡
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE, -- nullable: 下書き保存のみのケース
  text_content TEXT,
  image_url TEXT,
  image_prompt TEXT,
  theme TEXT, -- 投稿テーマ
  summary TEXT, -- 過去投稿との重複回避に使う要約（30〜50字）
  status TEXT DEFAULT 'draft', -- 'draft' | 'scheduled' | 'posted' | 'failed'
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT, -- Threads投稿後のID
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 参考アカウント（投稿生成時のネタ元として使うブックマーク）
CREATE TABLE reference_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'threads',
  handle TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿テーマ・ネタ管理
CREATE TABLE post_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  theme TEXT NOT NULL,
  description TEXT,
  example_post TEXT, -- 参考投稿例
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 投稿ログ
CREATE TABLE post_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'generated' | 'approved' | 'scheduled' | 'posted' | 'failed'
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS（Row Level Security）ポリシー
-- ============================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_accounts ENABLE ROW LEVEL SECURITY;

-- reference_accounts: 自分のものだけ
CREATE POLICY "reference_accounts: own data only"
  ON reference_accounts FOR ALL
  USING (auth.uid() = user_id);

-- accounts: 自分のアカウントのみアクセス可
CREATE POLICY "accounts: own data only"
  ON accounts FOR ALL
  USING (auth.uid() = user_id);

-- posts: 自分のアカウントの投稿、または account_id=NULL のデモ投稿で user_id が自分のもの
CREATE POLICY "posts: own data only"
  ON posts FOR ALL
  USING (
    user_id = auth.uid()
    OR account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  );

-- post_themes: 自分のアカウントのテーマのみ
CREATE POLICY "post_themes: own accounts only"
  ON post_themes FOR ALL
  USING (
    account_id IN (
      SELECT id FROM accounts WHERE user_id = auth.uid()
    )
  );

-- post_logs: 自分の投稿のログのみ
CREATE POLICY "post_logs: own posts only"
  ON post_logs FOR ALL
  USING (
    post_id IN (
      SELECT p.id FROM posts p
      JOIN accounts a ON p.account_id = a.id
      WHERE a.user_id = auth.uid()
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
