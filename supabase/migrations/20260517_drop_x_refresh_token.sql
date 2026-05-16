-- X の OAuth フロー / 自動リフレッシュを廃止したため、x_refresh_token カラムを削除
ALTER TABLE accounts DROP COLUMN IF EXISTS x_refresh_token;
