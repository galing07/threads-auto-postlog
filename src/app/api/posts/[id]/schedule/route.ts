// 投稿の予約 / 予約取消 (POST /api/posts/[id]/schedule)
//
// body:
//   { scheduledAt: ISO文字列, accountId?: string }  → 予約（status='scheduled'）
//   { scheduledAt: null }                            → 予約取消（status='draft' に戻す）
//
// 予約には投稿先アカウント(account_id)が必須。body.accountId 指定があれば設定し、
// 無ければ既存の post.account_id を使う。どちらも無ければ 400。
// 実際の送信は pg_cron → /api/cron/publish-scheduled が期限到来時に行う。

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// 予約可能な現在ステータス（投稿済みは不可）
const SCHEDULABLE = new Set(['draft', 'failed', 'scheduled'])
// 過去すぎる指定を弾く猶予（クライアント時計ズレ + 次回 cron までを考慮し 1 分）
const PAST_GRACE_MS = 60_000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as { scheduledAt?: string | null; accountId?: string }

    // 所有者検証（user_id 直所有 or account 経由所有）
    const { data: post, error: lookupErr } = await supabase
      .from('posts')
      .select('id, user_id, account_id, status, text_content, account:accounts(user_id)')
      .eq('id', id)
      .single()
    if (lookupErr || !post) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }
    type AccountRef = { user_id: string } | { user_id: string }[] | null
    const accountUserId = (() => {
      const acc = post.account as AccountRef
      if (!acc) return null
      return Array.isArray(acc) ? acc[0]?.user_id ?? null : acc.user_id
    })()
    const ownsPost = post.user_id === user.id || (accountUserId !== null && accountUserId === user.id)
    if (!ownsPost) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    // ---- 予約取消 ----
    if (body.scheduledAt === null) {
      if (post.status !== 'scheduled') {
        return NextResponse.json({ error: '予約中の投稿ではありません' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('posts')
        .update({ status: 'draft', scheduled_at: null, next_attempt_at: null, publish_attempts: 0 })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    // ---- 予約 ----
    if (typeof body.scheduledAt !== 'string' || !body.scheduledAt.trim()) {
      return NextResponse.json({ error: 'scheduledAt（予約日時）が必要です' }, { status: 400 })
    }
    const when = new Date(body.scheduledAt)
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: '予約日時の形式が不正です' }, { status: 400 })
    }
    if (when.getTime() < Date.now() - PAST_GRACE_MS) {
      return NextResponse.json({ error: '予約日時は現在より後を指定してください' }, { status: 400 })
    }
    if (!SCHEDULABLE.has(post.status)) {
      return NextResponse.json({ error: 'この投稿は予約できない状態です' }, { status: 400 })
    }
    if (!post.text_content || !post.text_content.trim()) {
      return NextResponse.json({ error: '本文が空の投稿は予約できません' }, { status: 400 })
    }

    // 投稿先アカウントの確定（body 指定があれば所有検証して採用、無ければ既存）
    let accountId = post.account_id
    if (body.accountId) {
      const { data: owned } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', body.accountId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!owned) {
        return NextResponse.json({ error: '指定されたアカウントが見つかりません' }, { status: 404 })
      }
      accountId = owned.id
    }
    if (!accountId) {
      return NextResponse.json({ error: '投稿先アカウントを指定してください' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('posts')
      .update({
        status: 'scheduled',
        scheduled_at: when.toISOString(),
        account_id: accountId,
        publish_attempts: 0,
        next_attempt_at: null,
        error_message: null,
      })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    await supabase.from('post_logs').insert({
      post_id: id,
      action: 'approved',
      message: `予約設定: ${when.toISOString()}`,
    })

    return NextResponse.json(data)
  } catch (e) {
    console.error('[posts schedule]', id, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '予約に失敗しました' }, { status: 500 })
  }
}
