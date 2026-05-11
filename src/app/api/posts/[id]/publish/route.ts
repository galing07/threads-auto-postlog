import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { publishPost } from '@/lib/platforms/publishers'
import type { Account } from '@/types/database'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
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

    // 所有者チェック（IDOR対策）：post.user_id または join した account.user_id が認証ユーザーと一致すること
    const ownsPost =
      (post.user_id && post.user_id === user.id) ||
      (account?.user_id && account.user_id === user.id)
    if (!ownsPost || !account) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    let platformPostId: string
    try {
      const result = await publishPost({ post, account })
      platformPostId = result.platformPostId
    } catch (e) {
      // validate / publish の失敗は 400 でユーザーに返す
      const message = e instanceof Error ? e.message : '投稿に失敗しました'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    await supabase
      .from('posts')
      .update({ status: 'posted', posted_at: new Date().toISOString(), platform_post_id: platformPostId })
      .eq('id', id)

    await supabase.from('post_logs').insert({
      post_id: id,
      action: 'posted',
      message: `${account.platform} 投稿成功: ${platformPostId}`,
    })

    return NextResponse.json({ success: true, platformPostId })
  } catch (e) {
    const internalMessage = e instanceof Error ? e.message : 'unknown'
    console.error('[posts/publish]', id, internalMessage)

    // 詳細なエラーは server log のみ。クライアントへは固定メッセージ
    await (await createServerSupabaseClient())
      .from('post_logs')
      .insert({ post_id: id, action: 'failed', message: internalMessage })

    return NextResponse.json({ error: '投稿に失敗しました' }, { status: 500 })
  }
}
