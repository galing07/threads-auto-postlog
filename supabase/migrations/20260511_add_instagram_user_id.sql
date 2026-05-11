-- Add instagram_user_id column to accounts table
-- For Instagram Business Account ID (Graph API)

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS instagram_user_id TEXT;

COMMENT ON COLUMN accounts.instagram_user_id IS 'Instagram Business Account ID (used for /{ig-user-id}/media endpoint)';
