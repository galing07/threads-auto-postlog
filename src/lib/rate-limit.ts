import 'server-only'
import { createAdminClient } from '@/lib/supabase-admin'

export interface RateLimitResult {
  ok: boolean
  count: number
  limit: number
}

/**
 * 固定ウィンドウ方式のレート制限。
 * Supabase の increment_rate_limit() RPC でアトミックにカウント。
 * RPC 失敗時は「通す」(fail-open) — 監視外の理由でユーザーをブロックしないため。
 */
export async function checkRateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('increment_rate_limit', {
      p_user_id: userId,
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.error('[rate-limit] rpc error', error.message)
      return { ok: true, count: 0, limit }
    }
    const count = typeof data === 'number' ? data : 0
    return { ok: count <= limit, count, limit }
  } catch (e) {
    console.error('[rate-limit]', e instanceof Error ? e.message : 'unknown')
    return { ok: true, count: 0, limit }
  }
}

/** プリセット */
export const RATE_LIMITS = {
  generate: { limit: 60, windowSeconds: 3600 },   // AI 生成: 60 回 / 時
  apiKeys:  { limit: 20, windowSeconds: 3600 },    // APIキー更新: 20 回 / 時
} as const
