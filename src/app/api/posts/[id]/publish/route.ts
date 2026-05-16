import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { publishPost } from '@/lib/platforms/publishers'
import type { Account } from '@/types/database'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('*, account:accounts(*)')
    .eq('id', id)
    .single()

  if (postError || !post) {
    return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
  }

  const account = post.account as Account | null

  // 所有者チェック (IDOR 対策)
  const ownsPost =
    (post.user_id && post.user_id === user.id) ||
    (account?.user_id && account.user_id === user.id)
  if (!ownsPost || !account) {
    return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
  }

  // 冪等性: status が draft / failed のときだけ publishing に遷移できる
  // 二重クリック・並行リクエストで二重投稿を防ぐ
  const { data: locked, error: lockError } = await supabase
    .from('posts')
    .update({ status: 'publishing' })
    .eq('id', id)
    .in('status', ['draft', 'failed'])
    .select('id')
    .maybeSingle()

  if (lockError) {
    console.error('[publish lock]', id, lockError.message)
    return NextResponse.json({ error: '投稿状態の更新に失敗しました' }, { status: 500 })
  }
  if (!locked) {
    return NextResponse.json(
      { error: 'この投稿は既に処理中か投稿済みです' },
      { status: 409 },
    )
  }

  try {
    const result = await publishPost({ post, account })

    await supabase
      .from('posts')
      .update({
        status: 'posted',
        posted_at: new Date().toISOString(),
        platform_post_id: result.platformPostId,
        platform_post_ids: result.platformPostIds ?? null,
        error_message: null,
      })
      .eq('id', id)

    await supabase.from('post_logs').insert({
      post_id: id,
      action: 'posted',
      message: `${account.platform} 投稿成功: ${result.platformPostId}`,
    })

    return NextResponse.json({
      success: true,
      platformPostId: result.platformPostId,
      platformPostIds: result.platformPostIds,
    })
  } catch (e) {
    const internalMessage = e instanceof Error ? e.message : 'unknown'
    console.error('[posts/publish]', id, internalMessage)

    // 失敗時は status を failed に戻して error_message を残す
    await supabase
      .from('posts')
      .update({ status: 'failed', error_message: internalMessage.slice(0, 500) })
      .eq('id', id)

    await supabase.from('post_logs').insert({
      post_id: id,
      action: 'failed',
      message: internalMessage.slice(0, 500),
    })

    // validate / auth error はユーザーへのメッセージとして利用可能 (上記アダプタで内部詳細はマスク済み)
    // その他の予期せぬエラーは固定文言
    const clientMessage = e instanceof Error && e.message ? e.message : '投稿に失敗しました'
    return NextResponse.json({ error: clientMessage }, { status: 400 })
  }
}
