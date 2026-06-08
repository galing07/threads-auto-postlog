// 予約投稿の実行エンドポイント (POST /api/cron/publish-scheduled)
//
// 発火元: Supabase pg_cron が pg_net 経由で毎分このエンドポイントを叩く。
//   SELECT net.http_post(
//     url := 'https://<本番>/api/cron/publish-scheduled',
//     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
//   );
//
// 認可: Authorization: Bearer ${CRON_SECRET} のみ許可（cron 以外からの実行を拒否）。
//
// 二重送信防止（毎分実行 × 投稿に時間がかかるケース）:
//   1) stale 'publishing'（updated_at が古い=前回が途中で死んだ）を 'scheduled' に戻して回収
//   2) 期限到来分を status='scheduled'→'publishing' に「原子的 UPDATE」で claim
//      （単一 UPDATE 文なので、同時に走った cron は同じ行を二重 claim できない）
//   claim できた行だけを publish する。
//
// 失敗時: 指数バックオフ（5/15/45/135/405分）で最大5回まで再試行。超えたら failed 確定。
//
// 対象は posts（文章/画像）。動画公開予約はフェーズ2で追加する。

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { publishPost } from '@/lib/platforms/publishers'
import type { Account, Post } from '@/types/database'

// publish 系は外部 API 待ちがあるため少し長めに取る（Vercel 既定 300s 内）
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_ATTEMPTS = 5
// stale lock とみなす閾値（publishing のまま放置された行を回収する）
const STALE_PUBLISHING_MINUTES = 10
// 1 回の cron で処理する最大件数（安全弁）
const CLAIM_LIMIT = 25

/** 指数バックオフ（分）: 試行 1→5, 2→15, 3→45, 4→135, 5→405 ≒ 約7時間で打ち切り */
function backoffMinutes(attempt: number): number {
  return 5 * Math.pow(3, Math.max(0, attempt - 1))
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    if (!process.env.CRON_SECRET) {
      console.error('[cron/publish-scheduled] CRON_SECRET 未設定')
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  try {
    // ---- 1) stale 'publishing' を回収（前回 cron が途中で死んで残ったロック）----
    const staleCutoff = new Date(now - STALE_PUBLISHING_MINUTES * 60_000).toISOString()
    await admin
      .from('posts')
      .update({ status: 'scheduled', next_attempt_at: null })
      .eq('status', 'publishing')
      .not('scheduled_at', 'is', null) // 予約由来のものだけ（即時publishの publishing は触らない）
      .lt('updated_at', staleCutoff)

    // ---- 2) 期限到来分を原子的に claim（scheduled → publishing）----
    // 単一 UPDATE のため、並走 cron との二重 claim が起きない。
    const { data: claimedRaw, error: claimErr } = await admin
      .from('posts')
      .update({ status: 'publishing' })
      .eq('status', 'scheduled')
      .lte('scheduled_at', nowIso)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .select('*')
      .limit(CLAIM_LIMIT)

    if (claimErr) {
      console.error('[cron/publish-scheduled] claim 失敗', claimErr.message)
      return NextResponse.json({ error: 'claim failed' }, { status: 500 })
    }

    const claimed = (claimedRaw ?? []) as Post[]
    if (claimed.length === 0) {
      return NextResponse.json({ posts: { claimed: 0, posted: 0, retry: 0, failed: 0 } })
    }

    // 対象 post の account をまとめて取得（publishPost が内部で復号する）
    const accountIds = [...new Set(claimed.map((p) => p.account_id).filter((v): v is string => !!v))]
    const accountsById = new Map<string, Account>()
    if (accountIds.length > 0) {
      const { data: accs } = await admin.from('accounts').select('*').in('id', accountIds)
      for (const a of (accs ?? []) as Account[]) accountsById.set(a.id, a)
    }

    let posted = 0
    let retry = 0
    let failed = 0

    await Promise.allSettled(
      claimed.map(async (post) => {
        const account = post.account_id ? accountsById.get(post.account_id) : undefined

        // 投稿先アカウントが無い/消えた → これ以上リトライ不可なので failed
        if (!account) {
          failed += 1
          await admin
            .from('posts')
            .update({ status: 'failed', error_message: '投稿先アカウントが設定されていません' })
            .eq('id', post.id)
          await admin.from('post_logs').insert({
            post_id: post.id,
            action: 'failed',
            message: '予約投稿失敗: 投稿先アカウントが見つかりません',
          })
          return
        }

        try {
          const result = await publishPost({ post, account })
          posted += 1
          await admin
            .from('posts')
            .update({
              status: 'posted',
              posted_at: new Date().toISOString(),
              platform_post_id: result.platformPostId,
              platform_post_ids: result.platformPostIds ?? null,
              error_message: null,
            })
            .eq('id', post.id)
          await admin.from('post_logs').insert({
            post_id: post.id,
            action: 'posted',
            message: `${account.platform} 予約投稿成功: ${result.platformPostId}`,
          })
        } catch (e) {
          // PublishError のメッセージは機密を含まない設計。汎用 Error も message のみ・上限付き。
          const message = (e instanceof Error ? e.message : 'unknown').slice(0, 500)
          const attempts = (post.publish_attempts ?? 0) + 1

          if (attempts >= MAX_ATTEMPTS) {
            failed += 1
            await admin
              .from('posts')
              .update({ status: 'failed', publish_attempts: attempts, error_message: message })
              .eq('id', post.id)
            await admin.from('post_logs').insert({
              post_id: post.id,
              action: 'failed',
              message: `予約投稿 最終失敗 (${attempts}/${MAX_ATTEMPTS}): ${message}`,
            })
          } else {
            // 'scheduled' に戻し、next_attempt_at を未来に。次の cron が時刻到来後に再 claim する。
            retry += 1
            const nextAttemptIso = new Date(now + backoffMinutes(attempts) * 60_000).toISOString()
            await admin
              .from('posts')
              .update({
                status: 'scheduled',
                publish_attempts: attempts,
                next_attempt_at: nextAttemptIso,
                error_message: message,
              })
              .eq('id', post.id)
            await admin.from('post_logs').insert({
              post_id: post.id,
              action: 'failed',
              message: `予約投稿 再試行予定 (${attempts}/${MAX_ATTEMPTS}) 次回 ${nextAttemptIso}: ${message}`,
            })
          }
        }
      }),
    )

    return NextResponse.json({ posts: { claimed: claimed.length, posted, retry, failed } })
  } catch (e) {
    console.error('[cron/publish-scheduled]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
