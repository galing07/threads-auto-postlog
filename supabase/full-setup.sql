-- ============================================================
-- threads-auto-post 完全セットアップSQL（1回貼ればOK / 冪等・再実行可）
-- 中身 = schema.sql（土台）＋ migrations/*.sql（全追加分）を順に連結
-- 使い方: 新規Supabase → SQL Editor に全文を貼って Run
-- 生成日: 2026-06-09
-- ============================================================

-- ########## BASE: schema.sql ##########
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
  -- X (OAuth 1.0a User Context: Developer Portal の4キー)
  x_user_id TEXT,
  x_api_key TEXT,
  x_api_secret TEXT,
  x_access_secret TEXT,
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


-- ########## MIGRATION: 20260511_add_instagram_user_id.sql ##########
-- Add instagram_user_id column to accounts table
-- For Instagram Business Account ID (Graph API)

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;

COMMENT ON COLUMN accounts.instagram_user_id IS 'Instagram Business Account ID (used for /{ig-user-id}/media endpoint)';


-- ########## MIGRATION: 20260516_align_with_schema.sql ##########
-- 既存環境を最新スキーマに合わせるための整合マイグレーション
-- ・X 用カラム / platform_post_ids を追加
-- ・予約投稿 (scheduled) と TikTok 動画機能 (video_url) を撤廃
-- ・status / action / platform に CHECK 制約を追加
-- ・post_logs RLS をデモ投稿（account_id=NULL）にも対応
-- ・主要 index を追加

-- ----- accounts: X カラム追加 -----
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_user_id TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_refresh_token TEXT;

-- ----- accounts.platform CHECK -----
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_platform_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_platform_check
  CHECK (platform IN ('threads', 'instagram', 'x'));

-- ----- posts: platform_post_ids 追加 -----
ALTER TABLE posts ADD COLUMN IF NOT EXISTS platform_post_ids TEXT[];

-- ----- TikTok 動画機能を撤廃 -----
ALTER TABLE posts DROP COLUMN IF EXISTS video_url;

-- ----- 予約投稿関連を撤廃 -----
DROP INDEX IF EXISTS idx_posts_scheduled_retry;
ALTER TABLE posts DROP COLUMN IF EXISTS scheduled_at;
ALTER TABLE posts DROP COLUMN IF EXISTS attempt_count;
ALTER TABLE posts DROP COLUMN IF EXISTS next_retry_at;

-- 残っている 'scheduled' status を 'draft' に倒す
UPDATE posts SET status = 'draft' WHERE status = 'scheduled';

-- ----- posts.status CHECK / NOT NULL -----
ALTER TABLE posts ALTER COLUMN status SET NOT NULL;
ALTER TABLE posts ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('draft', 'publishing', 'posted', 'failed'));

-- ----- post_logs.action CHECK -----
ALTER TABLE post_logs DROP CONSTRAINT IF EXISTS post_logs_action_check;
ALTER TABLE post_logs
  ADD CONSTRAINT post_logs_action_check
  CHECK (action IN ('generated', 'approved', 'posted', 'failed'));

-- ----- reference_accounts.platform CHECK -----
ALTER TABLE reference_accounts DROP CONSTRAINT IF EXISTS reference_accounts_platform_check;
ALTER TABLE reference_accounts
  ADD CONSTRAINT reference_accounts_platform_check
  CHECK (platform IN ('threads', 'instagram', 'x'));

-- ----- Indexes -----
CREATE INDEX IF NOT EXISTS idx_accounts_user_id        ON accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id           ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_account_created   ON posts (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status            ON posts (status);
CREATE INDEX IF NOT EXISTS idx_reference_accounts_user ON reference_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_post_themes_account    ON post_themes (account_id);
CREATE INDEX IF NOT EXISTS idx_post_logs_post_id       ON post_logs (post_id);

-- ----- post_logs RLS: デモ投稿のログも見えるように -----
DROP POLICY IF EXISTS "post_logs: own posts only" ON post_logs;
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


-- ########## MIGRATION: 20260517_account_prompt_settings.sql ##########
-- アカウントごとのカスタムプロンプト設定
-- 既存のシステムプロンプトに「追加指示」として混ぜる
-- 旧 user_prompt_settings は廃止して account_prompt_settings に置き換え

DROP TABLE IF EXISTS user_prompt_settings;

CREATE TABLE IF NOT EXISTS account_prompt_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  text_extra TEXT,
  image_extra TEXT,
  themes_extra TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE account_prompt_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_prompt_settings: own accounts only" ON account_prompt_settings;
CREATE POLICY "account_prompt_settings: own accounts only"
  ON account_prompt_settings FOR ALL
  USING (
    account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  )
  WITH CHECK (
    account_id IN (SELECT id FROM accounts WHERE user_id = auth.uid())
  );


-- ########## MIGRATION: 20260517_drop_x_refresh_token.sql ##########
-- X の OAuth フロー / 自動リフレッシュを廃止したため、x_refresh_token カラムを削除
ALTER TABLE accounts DROP COLUMN IF EXISTS x_refresh_token;


-- ########## MIGRATION: 20260517_rate_limits.sql ##########
-- 簡易レート制限: 固定ウィンドウ方式
-- (user_id, bucket, window_start) ごとにカウントを持つ。
-- service_role からのみ更新（RLS 有効・ポリシー無し = anon/auth は触れない）

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- ポリシーを作らない = service_role 以外は一切アクセス不可

-- 古いウィンドウ行を消す用の index
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- アトミックに +1 して現在カウントを返す関数（固定ウィンドウ）
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


-- ########## MIGRATION: 20260517_user_api_keys.sql ##########
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


-- ########## MIGRATION: 20260518_harden_and_cleanup.sql ##########
-- セキュリティ強化 + 残骸掃除
-- ・TikTok 残骸の孤児カラム (heygen_*) を削除
-- ・rate_limits / increment_rate_limit を service_role 限定に（最小権限）
-- ・increment_rate_limit に確率的 cleanup を内蔵（テーブル肥大防止）
--
-- 注: user_api_keys / account_prompt_settings は API ルートが authenticated
--     ロールでアクセスし RLS で行制限しているため、テーブル権限は維持する。

-- ----- 孤児カラム削除 -----
ALTER TABLE accounts DROP COLUMN IF EXISTS heygen_avatar_id;
ALTER TABLE accounts DROP COLUMN IF EXISTS heygen_voice_id;

-- ----- rate_limits を service_role 限定 -----
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION increment_rate_limit(uuid, text, integer) FROM anon, authenticated;

-- ----- RPC を再定義（確率的 cleanup を内蔵） -----
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

  -- 約1%の確率で2日より古いウィンドウ行を掃除（cron 不要のセルフメンテナンス）
  IF random() < 0.01 THEN
    DELETE FROM rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  INSERT INTO rate_limits (user_id, bucket, window_start, count)
  VALUES (p_user_id, p_bucket, v_window_start, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_rate_limit(uuid, text, integer) FROM anon, authenticated;


-- ########## MIGRATION: 20260518_prompt_fulltext.sql ##########
-- プロンプトを「追加指示」から「デフォルト全文を上書き編集」方式へ移行
-- NULL = デフォルトテンプレートを使用 / 値あり = その全文をテンプレートとして使用
-- 旧 *_extra カラムは後方互換のため残すが新方式では未使用

ALTER TABLE account_prompt_settings ADD COLUMN IF NOT EXISTS text_prompt TEXT;
ALTER TABLE account_prompt_settings ADD COLUMN IF NOT EXISTS image_prompt TEXT;
ALTER TABLE account_prompt_settings ADD COLUMN IF NOT EXISTS themes_prompt TEXT;


-- ########## MIGRATION: 20260518_x_oauth1.sql ##########
-- X を OAuth 1.0a User Context（Developer Portal のボタンで取れる4キー）方式に
-- access_token は既存 accounts.access_token を流用（X の Access Token を保存）
-- 追加で API Key / API Key Secret / Access Token Secret を保存

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_api_key TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_api_secret TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_access_secret TEXT;


-- ########## MIGRATION: 20260520_video_storage_bucket.sql ##########
-- 動画パイプライン用 Supabase Storage バケット
--
-- ・bucket: 'videos' (非公開)
-- ・パス規約: <auth.uid()>/<video_id>/{scenes/<order>.mp3, final.mp4, ...}
-- ・閲覧は本人のみ、書き込みは service_role のみ
--   (ワーカー / API ルートが service-role キーで Upload する想定)

-- ============================================
-- bucket 作成 (idempotent)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', false)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public;

-- ============================================
-- RLS ポリシー
-- ============================================
-- 本人 (auth.uid()) のディレクトリ配下だけ SELECT 可能。
-- storage.objects の `name` は "uid/video-id/..." を想定。
DROP POLICY IF EXISTS "videos bucket: owner can read" ON storage.objects;
CREATE POLICY "videos bucket: owner can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'videos'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

-- INSERT / UPDATE / DELETE は service_role のみ。
-- 認証ユーザーには明示的に拒否し、ワーカー側で service-role キーを使う。
DROP POLICY IF EXISTS "videos bucket: deny client writes" ON storage.objects;
CREATE POLICY "videos bucket: deny client writes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "videos bucket: deny client updates" ON storage.objects;
CREATE POLICY "videos bucket: deny client updates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "videos bucket: deny client deletes" ON storage.objects;
CREATE POLICY "videos bucket: deny client deletes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (false);


-- ########## MIGRATION: 20260520_videos_and_scenes.sql ##########
-- AI ショート動画生成サブシステム
-- ・videos: 動画 1 本のメタ + 全体ナレーション音声 + パイプライン状態
-- ・scenes: 動画を構成するシーン（テロップ / ナレーション / 画像 / 尺）
--
-- パイプライン想定:
--   1. draft でレコード作成
--   2. generating_script  (LLM で全体台本生成 → videos.script を埋める)
--   3. generating_images  (各 scene の image_prompt → gpt-image-1 で生成 → scenes.image_url)
--   4. generating_voice   (ElevenLabs で video 全体の音声合成 → videos.voice_url)
--   5. rendering          (Remotion でレンダリング)
--   6. ready              (完了) / failed (失敗)
--
-- RLS は既存 accounts / posts と同じ「本人のみ」パターン。
-- scenes は video 経由のサブクエリで間接所有を表現（post_logs と同じ流儀）。

-- ============================================
-- videos
-- ============================================
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  script TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'generating_script',
      'generating_images',
      'generating_voice',
      'rendering',
      'ready',
      'failed'
    )),
  voice_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "videos: own data only" ON videos;
CREATE POLICY "videos: own data only"
  ON videos FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos (user_id);
CREATE INDEX IF NOT EXISTS idx_videos_status  ON videos (status);

-- ============================================
-- scenes
-- ============================================
-- order_index: 動画内のシーン順序。仕様には明記されていないが、
-- 並び順制御に必須のため追加した（フラグ: 不要なら相談）。
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE NOT NULL,
  order_index INTEGER NOT NULL,
  caption_text TEXT,       -- テロップ（Remotion 側で表示するテキスト）
  narration_text TEXT,     -- ナレーション原稿（ElevenLabs で音声化）
  image_prompt TEXT,       -- 画像生成プロンプト
  image_url TEXT,          -- gpt-image-1 で生成された画像（Supabase Storage 想定）
  duration NUMERIC(5,2),   -- シーン尺（秒）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

-- video 経由で所有判定（accounts → posts → post_logs と同じ間接所有パターン）
DROP POLICY IF EXISTS "scenes: own videos only" ON scenes;
CREATE POLICY "scenes: own videos only"
  ON scenes FOR ALL
  USING (
    video_id IN (SELECT id FROM videos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    video_id IN (SELECT id FROM videos WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_scenes_video_id            ON scenes (video_id);
CREATE INDEX IF NOT EXISTS idx_scenes_video_id_order_idx  ON scenes (video_id, order_index);

-- ============================================
-- updated_at 自動更新トリガー（共有関数 update_updated_at を再利用）
-- ============================================
DROP TRIGGER IF EXISTS videos_updated_at ON videos;
CREATE TRIGGER videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS scenes_updated_at ON scenes;
CREATE TRIGGER scenes_updated_at
  BEFORE UPDATE ON scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ########## MIGRATION: 20260520_videos_pipeline_extensions.sql ##########
-- AI 動画パイプラインのための追加カラム / 制約調整
--
-- 想定パイプライン:
--   videos (script→images→voice→render) → 完成 (ready)
--     → publish_status='unpublished'
--     → TikTok / YouTube に投稿 → publish_status='published', published_to=['tiktok',...]
--
-- このマイグレーションは追加専用 (idempotent)。
-- ・videos     : 公開先 / 公開状態を表すカラム
-- ・scenes     : シーン単位の音声 URL (Storage)
-- ・accounts   : TikTok / YouTube の OAuth ペイロード
-- ・user_api_keys: ElevenLabs キー (`src/lib/video/elevenlabs.ts` が前提とする)
-- ・accounts.platform CHECK 制約に 'tiktok' / 'youtube' を追加

-- ============================================
-- videos: 公開メタデータ
-- ============================================
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS final_video_url TEXT;
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS publish_status TEXT NOT NULL DEFAULT 'unpublished';
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS published_to TEXT[];
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS tiktok_publish_id TEXT;
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_publish_status_check;
ALTER TABLE videos
  ADD CONSTRAINT videos_publish_status_check
  CHECK (publish_status IN ('unpublished', 'publishing', 'published', 'publish_failed'));

CREATE INDEX IF NOT EXISTS idx_videos_account_id     ON videos (account_id);
CREATE INDEX IF NOT EXISTS idx_videos_publish_status ON videos (publish_status);

-- ============================================
-- scenes: シーン毎の音声 URL
-- ============================================
ALTER TABLE scenes
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- ============================================
-- accounts: TikTok / YouTube OAuth カラム
-- ============================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS tiktok_open_id TEXT;
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS tiktok_refresh_token TEXT;
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT;
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS youtube_refresh_token TEXT;

-- 既存 CHECK は 'threads' | 'instagram' | 'x' のみ許可だったため
-- 'tiktok' / 'youtube' を許容するよう貼り直す。
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_platform_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_platform_check
  CHECK (platform IN ('threads', 'instagram', 'x', 'tiktok', 'youtube'));

-- ============================================
-- user_api_keys: ElevenLabs キー
-- ============================================
ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS elevenlabs_key TEXT;


-- ########## MIGRATION: 20260525_heygen_mode_and_byok.sql ##########
-- HeyGen AI avatar video mode + BYOK key.
--
-- Why: ユーザーが動画生成方法を選べるようにする (Remotion vs HeyGen avatar).
-- HeyGen API キーも user ごとに BYOK で保存する。

alter table public.videos
  add column if not exists generation_mode text not null default 'remotion',
  add column if not exists heygen_avatar_id text,
  add column if not exists heygen_voice_id text,
  add column if not exists heygen_video_id text,
  add column if not exists voice_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'videos_generation_mode_chk'
  ) then
    alter table public.videos
      add constraint videos_generation_mode_chk
      check (generation_mode in ('remotion', 'heygen_avatar'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'videos_voice_source_chk'
  ) then
    alter table public.videos
      add constraint videos_voice_source_chk
      check (voice_source is null or voice_source in ('elevenlabs', 'heygen'));
  end if;
end $$;

comment on column public.videos.generation_mode is
  'Pipeline branch: remotion (scene composition) or heygen_avatar (talking avatar)';
comment on column public.videos.heygen_avatar_id is
  'HeyGen avatar_id selected by the user (heygen_avatar mode only)';
comment on column public.videos.heygen_voice_id is
  'HeyGen built-in voice_id (only when voice_source=heygen)';
comment on column public.videos.heygen_video_id is
  'HeyGen-side async job id returned from POST /v2/video/generate';
comment on column public.videos.voice_source is
  'Voice synthesis source: elevenlabs (BYOK TTS) or heygen (built-in)';

alter table public.user_api_keys
  add column if not exists heygen_key text;

comment on column public.user_api_keys.heygen_key is
  'Encrypted HeyGen API key (BYOK, AES-GCM v1 prefix scheme)';


-- ########## MIGRATION: 20260525_video_constraints_and_indexes.sql ##########
-- Composite check: heygen_avatar mode requires voice_source + heygen_avatar_id;
-- if voice_source='heygen', also requires heygen_voice_id.
-- Remotion mode should have voice_source = null.

alter table public.videos
  drop constraint if exists videos_mode_consistency_chk;

alter table public.videos
  add constraint videos_mode_consistency_chk
  check (
    (generation_mode = 'remotion' and voice_source is null)
    or
    (generation_mode = 'heygen_avatar'
      and voice_source is not null
      and heygen_avatar_id is not null
      and (voice_source <> 'heygen' or heygen_voice_id is not null))
  );

-- Index on generation_mode for "show all heygen videos" / cost analytics queries.
create index if not exists idx_videos_generation_mode
  on public.videos (generation_mode);


-- ########## MIGRATION: 20260525_videos_instagram_reels.sql ##########
-- Add Instagram Reels support to the videos table.
--
-- Why: video publishing previously supported tiktok / youtube only. Adding
-- Instagram Reels as a third destination requires one new column to store the
-- platform-side reel ID (mirroring tiktok_publish_id / youtube_video_id).
--
-- published_to already stores a Platform[] enum so we don't need a separate
-- column for "was published to instagram"; the new column only holds the
-- returned Reels media ID for later reference.

alter table public.videos
  add column if not exists instagram_reel_id text;

comment on column public.videos.instagram_reel_id is
  'Instagram Graph API media ID returned from /media_publish for a Reels post';


-- ########## MIGRATION: 20260527_videos_elevenlabs_voice_id.sql ##########
-- videos に ElevenLabs voice ID カラムを追加。
-- Remotion 経路の各シーン音声に使う voice を動画単位で保持する。
-- NULL のとき src/lib/video/voice-presets.ts の DEFAULT_VOICE_ID にフォールバック。

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_id TEXT;

COMMENT ON COLUMN videos.elevenlabs_voice_id IS
  'ElevenLabs voice ID for narration. NULL = default voice from voice-presets.ts';


-- ########## MIGRATION: 20260528_videos_generation_started_at.sql ##########
-- 動画生成開始時刻を保存。リロード後も進捗バーの経過時間が継続するように使う。
-- 初回生成および restart 時に書き込まれる (pipeline.ts / restart route)。

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ;

COMMENT ON COLUMN videos.generation_started_at IS
  'Timestamp when the generation pipeline started. NULL until first kick. Used by the UI to compute elapsed time so progress survives page reloads.';


-- ########## MIGRATION: 20260529_rls_perf_and_constraints.sql ##########
-- =====================================================================
-- RLS 性能改善 + 制約の整合（2026-05-29 全体レビュー対応）
-- =====================================================================
-- 1. 全 RLS ポリシーの auth.uid() を (SELECT auth.uid()) でラップ。
--    PostgreSQL は auth.uid() を「行ごと」に再評価するため、大きなテーブルで
--    フルスキャン的なオーバーヘッドになる。(SELECT ...) でラップすると
--    initplan として 1 回だけ評価される（Supabase 公式推奨）。
-- 2. scenes に (video_id, order_index) の UNIQUE 制約（重複 order_index による
--    非決定的ソートを防ぐ）。
-- 3. reference_accounts / post_themes の platform CHECK を tiktok / youtube まで拡張
--    （accounts は既に拡張済みで TS の Platform 型とも一致させる）。
--
-- 冪等性: DROP POLICY IF EXISTS → CREATE POLICY の順で再適用可能。
-- =====================================================================

-- ---- accounts ----
DROP POLICY IF EXISTS "accounts: own data only" ON accounts;
CREATE POLICY "accounts: own data only"
  ON accounts FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---- user_api_keys ----
DROP POLICY IF EXISTS "user_api_keys: own data only" ON user_api_keys;
CREATE POLICY "user_api_keys: own data only"
  ON user_api_keys FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---- reference_accounts ----
DROP POLICY IF EXISTS "reference_accounts: own data only" ON reference_accounts;
CREATE POLICY "reference_accounts: own data only"
  ON reference_accounts FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---- account_prompt_settings ----
DROP POLICY IF EXISTS "account_prompt_settings: own accounts only" ON account_prompt_settings;
CREATE POLICY "account_prompt_settings: own accounts only"
  ON account_prompt_settings FOR ALL
  USING (account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid())));

-- ---- posts ----
DROP POLICY IF EXISTS "posts: own data only" ON posts;
CREATE POLICY "posts: own data only"
  ON posts FOR ALL
  USING (
    user_id = (SELECT auth.uid())
    OR account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid()))
  );

-- ---- post_themes ----
DROP POLICY IF EXISTS "post_themes: own accounts only" ON post_themes;
CREATE POLICY "post_themes: own accounts only"
  ON post_themes FOR ALL
  USING (account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid())));

-- ---- post_logs ----
DROP POLICY IF EXISTS "post_logs: own posts only" ON post_logs;
CREATE POLICY "post_logs: own posts only"
  ON post_logs FOR ALL
  USING (
    post_id IN (
      SELECT id FROM posts
      WHERE user_id = (SELECT auth.uid())
         OR account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts
      WHERE user_id = (SELECT auth.uid())
         OR account_id IN (SELECT id FROM accounts WHERE user_id = (SELECT auth.uid()))
    )
  );

-- ---- videos ----
DROP POLICY IF EXISTS "videos: own data only" ON videos;
CREATE POLICY "videos: own data only"
  ON videos FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---- scenes ----
DROP POLICY IF EXISTS "scenes: own videos only" ON scenes;
CREATE POLICY "scenes: own videos only"
  ON scenes FOR ALL
  USING (video_id IN (SELECT id FROM videos WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (video_id IN (SELECT id FROM videos WHERE user_id = (SELECT auth.uid())));

-- =====================================================================
-- 2. scenes の (video_id, order_index) UNIQUE
-- =====================================================================
-- 既に重複がある場合に備え、重複を解消してから制約を張る。
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY video_id ORDER BY order_index, id) - 1 AS new_idx
  FROM scenes
)
UPDATE scenes s
SET order_index = ranked.new_idx
FROM ranked
WHERE s.id = ranked.id AND s.order_index <> ranked.new_idx;

ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_video_order_unique;
ALTER TABLE scenes ADD CONSTRAINT scenes_video_order_unique UNIQUE (video_id, order_index);

-- =====================================================================
-- 3. platform CHECK の拡張（reference_accounts のみ。post_themes は platform 列なし）
-- =====================================================================
ALTER TABLE reference_accounts DROP CONSTRAINT IF EXISTS reference_accounts_platform_check;
ALTER TABLE reference_accounts ADD CONSTRAINT reference_accounts_platform_check
  CHECK (platform IN ('threads', 'instagram', 'x', 'tiktok', 'youtube'));


-- ########## MIGRATION: 20260605_instagram_app_credentials.sql ##########
-- Instagram ログイン方式（Business Login）用のアプリ資格情報をユーザーごとに保存。
-- 環境変数ではなくアプリ内で入力・暗号化保存することで、納品先クライアントが
-- 自分で設定できるようにする（OpenRouter 等の API キーと同じ運用）。
-- 値は既存の API キー同様 ENCRYPTION_KEY で暗号化して格納する。
alter table public.user_api_keys
  add column if not exists instagram_app_id text,
  add column if not exists instagram_app_secret text;


-- ########## MIGRATION: 20260606_accounts_unique_instagram.sql ##########
-- 同一ユーザーが同じ Instagram プロアカウント(instagram_user_id)を重複登録するのを防ぐ。
-- OAuth callback (/api/auth/instagram/callback) の SELECT→INSERT は、別タブから同時に
-- 認可を完了すると competing INSERT で二重挿入し得る。DB レベルで一意性を担保する。
--
-- 部分インデックス: instagram_user_id が NULL の行（threads / x / 未解決の手動アカウント）は
-- 制約対象外。これにより threads/x アカウントは従来どおり複数登録できる。
-- callback 側は INSERT の一意制約違反(23505)を捕捉して UPDATE にフォールバックする
-- （PostgREST の onConflict は部分インデックスを推論できないため、violation 捕捉方式を採用）。
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_platform_ig_uid_key
  ON public.accounts (user_id, platform, instagram_user_id)
  WHERE instagram_user_id IS NOT NULL;


-- ########## MIGRATION: 20260606_x_oauth2.sql ##########
-- X を OAuth 2.0 (PKCE) 連携に戻す。
-- アクセストークンは既存 accounts.access_token を流用（暗号化保存）、
-- リフレッシュトークンを x_refresh_token に暗号化保存する。
-- 旧 OAuth 1.0a の4キー（x_api_key/x_api_secret/x_access_secret）は併存可能なまま残す
-- （手動登録済みアカウントを壊さないため）。
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_refresh_token TEXT;


-- ########## MIGRATION: 20260606_x_oauth_app_credentials.sql ##########
-- X (Twitter) OAuth 2.0 のアプリ資格情報（Client ID / Secret）をユーザーごとに保存。
-- 環境変数ではなくアプリ内で入力・暗号化保存することで、納品先クライアントが
-- 自分で設定できるようにする（Instagram の instagram_app_id/secret と同じ BYOK 運用）。
-- 値は既存の API キー同様 ENCRYPTION_KEY で暗号化して格納する。
alter table public.user_api_keys
  add column if not exists x_oauth_client_id text,
  add column if not exists x_oauth_client_secret text;

