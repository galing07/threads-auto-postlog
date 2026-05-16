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
