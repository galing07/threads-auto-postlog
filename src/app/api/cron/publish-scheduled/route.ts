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

import crypto from 'crypto'
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
// 1 バッチで claim→publish する件数（外部 API を一度に叩きすぎないための並列上限）。
const BATCH_SIZE = 10
// 1 回の cron 実行で予約投稿に充てる時間予算(ms)。maxDuration(60s) 内に収め、
// 超過分は 'scheduled' のまま次の毎分 cron に委ねる。固定の件数上限(旧 CLAIM_LIMIT=25)は設けない。
const TIME_BUDGET_MS = 45_000

/** 指数バックオフ（分）: 試行 1→5, 2→15, 3→45, 4→135, 5→405 ≒ 約7時間で打ち切り */
function backoffMinutes(attempt: number): number {
  return 5 * Math.pow(3, Math.max(0, attempt - 1))
}

type PublishOutcome = 'posted' | 'retry' | 'failed'

/**
 * claim 済み(status:'publishing')の予約投稿を 1 件 publish し、結果に応じて DB を更新する。
 * 戻り値で集計用の結果種別を返す。例外は呼び出し側の Promise.allSettled が拾う。
 */
async function processClaimedPost(
  admin: ReturnType<typeof createAdminClient>,
  post: Post,
  account: Account | undefined,
  runStart: number,
): Promise<PublishOutcome> {
  // 投稿先アカウントが無い/消えた → これ以上リトライ不可なので failed
  if (!account) {
    await admin
      .from('posts')
      .update({ status: 'failed', error_message: '投稿先アカウントが設定されていません' })
      .eq('id', post.id)
    await admin.from('post_logs').insert({
      post_id: post.id,
      action: 'failed',
      message: '予約投稿失敗: 投稿先アカウントが見つかりません',
    })
    return 'failed'
  }

  try {
    const result = await publishPost({ post, account })
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
    return 'posted'
  } catch (e) {
    // PublishError のメッセージは機密を含まない設計。汎用 Error も message のみ・上限付き。
    const message = (e instanceof Error ? e.message : 'unknown').slice(0, 500)
    const attempts = (post.publish_attempts ?? 0) + 1

    if (attempts >= MAX_ATTEMPTS) {
      await admin
        .from('posts')
        .update({ status: 'failed', publish_attempts: attempts, error_message: message })
        .eq('id', post.id)
      await admin.from('post_logs').insert({
        post_id: post.id,
        action: 'failed',
        message: `予約投稿 最終失敗 (${attempts}/${MAX_ATTEMPTS}): ${message}`,
      })
      return 'failed'
    }

    // 'scheduled' に戻し、next_attempt_at を未来に。次の cron が時刻到来後に再 claim する。
    const nextAttemptIso = new Date(runStart + backoffMinutes(attempts) * 60_000).toISOString()
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
    return 'retry'
  }
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const provided = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`
  // タイミング攻撃対策の定数時間比較。長さが違うと timingSafeEqual が throw するため先に長さを確認する。
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
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

  try {
    // ---- 1) stale 'publishing' を回収（前回 cron が途中で死んで残ったロック）----
    const staleCutoff = new Date(now - STALE_PUBLISHING_MINUTES * 60_000).toISOString()
    await admin
      .from('posts')
      .update({ status: 'scheduled', next_attempt_at: null })
      .eq('status', 'publishing')
      .not('scheduled_at', 'is', null) // 予約由来のものだけ（即時publishの publishing は触らない）
      .lt('updated_at', staleCutoff)

    // ---- 2) 期限到来分を「小バッチ × 時間予算」で処理（固定の件数上限なし）----
    // BATCH_SIZE 件ずつ「scheduled → publishing」を原子的に claim（単一 UPDATE のため
    // 並走 cron と二重 claim しない）し、publish する。これを時間予算いっぱいまで繰り返す。
    // 処理しきれない分は 'scheduled' のまま残り、次の毎分 cron が続けて処理する
    // （claim した分だけ publishing にするので、中途半端な publishing 残留を作らない）。
    let posted = 0
    let retry = 0
    let failed = 0
    let totalClaimed = 0
    let timedOut = false

    while (true) {
      // 時間予算を超えたら残りは次の cron に委ねる（maxDuration 60s 内に収める）
      if (Date.now() - now >= TIME_BUDGET_MS) {
        timedOut = true
        break
      }

      const dueIso = new Date().toISOString()
      const { data: claimedRaw, error: claimErr } = await admin
        .from('posts')
        .update({ status: 'publishing' })
        .eq('status', 'scheduled')
        .lte('scheduled_at', dueIso)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${dueIso}`)
        .select('*')
        .limit(BATCH_SIZE)

      if (claimErr) {
        console.error('[cron/publish-scheduled] claim 失敗', claimErr.message)
        // 既に処理した分の結果は返す（部分成功）。何も処理していなければ 500。
        return NextResponse.json(
          { posts: { claimed: totalClaimed, posted, retry, failed }, error: 'claim failed (partial)' },
          { status: totalClaimed > 0 ? 200 : 500 },
        )
      }

      const batch = (claimedRaw ?? []) as Post[]
      if (batch.length === 0) break
      totalClaimed += batch.length

      // バッチ対象 post の account をまとめて取得（publishPost が内部で復号する）
      const accountIds = [...new Set(batch.map((p) => p.account_id).filter((v): v is string => !!v))]
      const accountsById = new Map<string, Account>()
      if (accountIds.length > 0) {
        const { data: accs } = await admin.from('accounts').select('*').in('id', accountIds)
        for (const a of (accs ?? []) as Account[]) accountsById.set(a.id, a)
      }

      const outcomes = await Promise.allSettled(
        batch.map((post) =>
          processClaimedPost(admin, post, post.account_id ? accountsById.get(post.account_id) : undefined, now),
        ),
      )
      for (const o of outcomes) {
        if (o.status === 'fulfilled') {
          if (o.value === 'posted') posted += 1
          else if (o.value === 'retry') retry += 1
          else failed += 1
        } else {
          // processClaimedPost が予期せず throw（DB更新失敗等）→ その行は publishing のまま残り、
          // stale-lock 回収で次回拾われる。集計上は failed 扱い。
          failed += 1
          console.error('[cron/publish-scheduled] post 処理で例外', o.reason instanceof Error ? o.reason.message : 'unknown')
        }
      }

      // バッチが満杯でなければ、もう due な予約は残っていない
      if (batch.length < BATCH_SIZE) break
    }

    return NextResponse.json({
      posts: { claimed: totalClaimed, posted, retry, failed },
      ...(timedOut ? { note: '時間予算に達したため、残りの予約は次の cron 実行で処理されます' } : {}),
    })
  } catch (e) {
    console.error('[cron/publish-scheduled]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
