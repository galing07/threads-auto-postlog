-- 予約投稿（再導入）。pg_cron が /api/cron/publish-scheduled を毎分叩いて期限到来分を投稿する。
-- posts(文章/画像) と videos(公開) の両方に対応。追加列のみ・冪等。
--
-- 経緯: 以前 Vercel Cron で実装→Hobbyプランの cron 制限(1日1回)で撤去(7e7f5ae)。
-- 今回は Supabase pg_cron(毎分・プラン非依存) で再導入する。

-- ========== posts ==========
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- status に 'scheduled' を許可（draft / scheduled / publishing / posted / failed）
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'posted', 'failed'));

-- cron の「期限到来分」クエリ用（status='scheduled' のみ対象の部分インデックス）
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_due
  ON posts (scheduled_at)
  WHERE status = 'scheduled';

-- ========== videos ==========
ALTER TABLE videos ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS publish_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- publish_status に 'scheduled' を許可
ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_publish_status_check;
ALTER TABLE videos
  ADD CONSTRAINT videos_publish_status_check
  CHECK (publish_status IN ('unpublished', 'scheduled', 'publishing', 'published', 'publish_failed'));

CREATE INDEX IF NOT EXISTS idx_videos_scheduled_due
  ON videos (scheduled_at)
  WHERE publish_status = 'scheduled';
