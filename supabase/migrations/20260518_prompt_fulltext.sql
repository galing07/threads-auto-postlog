-- プロンプトを「追加指示」から「デフォルト全文を上書き編集」方式へ移行
-- NULL = デフォルトテンプレートを使用 / 値あり = その全文をテンプレートとして使用
-- 旧 *_extra カラムは後方互換のため残すが新方式では未使用

ALTER TABLE account_prompt_settings ADD COLUMN IF NOT EXISTS text_prompt TEXT;
ALTER TABLE account_prompt_settings ADD COLUMN IF NOT EXISTS image_prompt TEXT;
ALTER TABLE account_prompt_settings ADD COLUMN IF NOT EXISTS themes_prompt TEXT;
