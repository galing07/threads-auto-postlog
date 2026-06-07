-- X (Twitter) OAuth 2.0 のアプリ資格情報（Client ID / Secret）をユーザーごとに保存。
-- 環境変数ではなくアプリ内で入力・暗号化保存することで、納品先クライアントが
-- 自分で設定できるようにする（Instagram の instagram_app_id/secret と同じ BYOK 運用）。
-- 値は既存の API キー同様 ENCRYPTION_KEY で暗号化して格納する。
alter table public.user_api_keys
  add column if not exists x_oauth_client_id text,
  add column if not exists x_oauth_client_secret text;
