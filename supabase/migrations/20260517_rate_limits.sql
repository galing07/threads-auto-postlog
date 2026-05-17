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
