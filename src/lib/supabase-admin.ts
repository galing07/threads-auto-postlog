import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Supabase service-role クライアント
 * - RLS をバイパスする。サーバー側専用 (server-only import で保護)
 * - session を持たないようにする (auth.persistSession=false)
 *
 * Storage upload、Webhook 処理 (signed_request 検証経由でのアカウント削除等)、
 * OAuth callback でのアカウント作成など、ユーザー認証 cookie が無い文脈で使う。
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}
