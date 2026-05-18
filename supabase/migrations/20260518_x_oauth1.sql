-- X を OAuth 1.0a User Context（Developer Portal のボタンで取れる4キー）方式に
-- access_token は既存 accounts.access_token を流用（X の Access Token を保存）
-- 追加で API Key / API Key Secret / Access Token Secret を保存

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_api_key TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_api_secret TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS x_access_secret TEXT;
