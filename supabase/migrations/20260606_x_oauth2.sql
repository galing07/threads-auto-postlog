-- X を OAuth 2.0 (PKCE) 連携に戻す。
-- アクセストークンは既存 accounts.access_token を流用（暗号化保存）、
-- リフレッシュトークンを x_refresh_token に暗号化保存する。
-- 旧 OAuth 1.0a の4キー（x_api_key/x_api_secret/x_access_secret）は併存可能なまま残す
-- （手動登録済みアカウントを壊さないため）。
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_refresh_token TEXT;
