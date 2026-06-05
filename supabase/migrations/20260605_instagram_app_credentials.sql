-- Instagram ログイン方式（Business Login）用のアプリ資格情報をユーザーごとに保存。
-- 環境変数ではなくアプリ内で入力・暗号化保存することで、納品先クライアントが
-- 自分で設定できるようにする（OpenRouter 等の API キーと同じ運用）。
-- 値は既存の API キー同様 ENCRYPTION_KEY で暗号化して格納する。
alter table public.user_api_keys
  add column if not exists instagram_app_id text,
  add column if not exists instagram_app_secret text;
