import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createThreadsPost } from '@/lib/platforms/threads'

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

    const account = post.account as { access_token: string | null; threads_user_id: string | null }

    if (!account.access_token || !account.threads_user_id) {
      return NextResponse.json(
        { error: 'Threads APIトークンが設定されていません' },
        { status: 400 }
      )
    }

    const result = await createThreadsPost(
      { accessToken: account.access_token, userId: account.threads_user_id },
      { text: post.text_content ?? '', imageUrl: post.image_url ?? undefined }
    )

    await supabase
      .from('posts')
      .update({ status: 'posted', posted_at: new Date().toISOString(), platform_post_id: result.id })
      .eq('id', id)

    await supabase.from('post_logs').insert({
      post_id: id,
      action: 'posted',
      message: `Threads投稿成功: ${result.id}`,
    })

    return NextResponse.json({ success: true, platformPostId: result.id })
  } catch (e) {
    const message = e instanceof Error ? e.message : '投稿に失敗しました'

    await (await createServerSupabaseClient())
      .from('post_logs')
      .insert({ post_id: id, action: 'failed', message })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
