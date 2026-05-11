-- Add retry control columns to posts table
-- 予約投稿失敗時の永続再試行ループを止める

ALTER TABLE posts ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

COMMENT ON COLUMN posts.attempt_count IS '予約投稿の試行回数（max 5 で failed 確定）';
COMMENT ON COLUMN posts.next_retry_at IS '次回再試行可能になる時刻（指数バックオフ）';

-- 高速検索用：scheduled で再試行可能な行を取りやすく
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_retry
  ON posts (status, scheduled_at, next_retry_at)
  WHERE status = 'scheduled';
