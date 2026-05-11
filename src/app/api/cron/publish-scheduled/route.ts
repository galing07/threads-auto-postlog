import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { publishPost } from '@/lib/platforms/publishers'
import type { Post, Account } from '@/types/database'

const MAX_ATTEMPTS = 5
// 指数バックオフ: 試行回数に応じて 5/15/45/135/405 分 (≒7時間で打ち切り)
function backoffMinutes(attempt: number): number {
  return 5 * Math.pow(3, Math.max(0, attempt - 1))
}

// Vercel Cron: 15分毎に予約投稿を実行
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[cron/publish-scheduled] CRON_SECRET is not configured')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const nowIso = now.toISOString()

  // status=scheduled かつ scheduled_at が過去
  // かつ next_retry_at が null または 過去
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*, account:accounts(*)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .limit(10)

  if (error) {
    console.error('[cron/publish-scheduled] query failed', error.message)
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const targets = (posts ?? []) as (Post & { account: Account })[]

  const results = await Promise.allSettled(
    targets.map(async post => {
      const result = await publishPost({ post, account: post.account })

      await supabase
        .from('posts')
        .update({
          status: 'posted',
          posted_at: nowIso,
          platform_post_id: result.platformPostId,
        })
        .eq('id', post.id)

      await supabase.from('post_logs').insert({
        post_id: post.id,
        action: 'posted',
        message: `${post.account.platform} 予約投稿成功: ${result.platformPostId}`,
      })

      return { postId: post.id, platform: post.account.platform, platformId: result.platformPostId }
    }),
  )

  // 失敗ハンドリング: attempt_count 加算 + バックオフ or failed 確定
  let permanentlyFailed = 0
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status !== 'rejected') return
      const post = targets[i]
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason)
      const nextAttempt = (post.attempt_count ?? 0) + 1

      if (nextAttempt >= MAX_ATTEMPTS) {
        permanentlyFailed += 1
        await supabase
          .from('posts')
          .update({
            status: 'failed',
            attempt_count: nextAttempt,
            error_message: message,
          })
          .eq('id', post.id)
        await supabase.from('post_logs').insert({
          post_id: post.id,
          action: 'failed',
          message: `予約投稿 最終失敗 (${nextAttempt}/${MAX_ATTEMPTS}): ${message}`,
        })
      } else {
        const nextRetry = new Date(now.getTime() + backoffMinutes(nextAttempt) * 60_000)
        await supabase
          .from('posts')
          .update({
            attempt_count: nextAttempt,
            next_retry_at: nextRetry.toISOString(),
            error_message: message,
          })
          .eq('id', post.id)
        await supabase.from('post_logs').insert({
          post_id: post.id,
          action: 'failed',
          message: `予約投稿失敗 (${nextAttempt}/${MAX_ATTEMPTS}) 次回再試行 ${nextRetry.toISOString()}: ${message}`,
        })
      }
    }),
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const transientFailed = results.filter(r => r.status === 'rejected').length - permanentlyFailed

  return NextResponse.json({
    processed: targets.length,
    succeeded,
    transientFailed,
    permanentlyFailed,
  })
}
