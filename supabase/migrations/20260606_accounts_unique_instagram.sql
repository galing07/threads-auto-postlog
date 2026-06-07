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
