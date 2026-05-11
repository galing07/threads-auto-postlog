import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createThreadsPost } from '@/lib/platforms/threads'
import { createInstagramPost } from '@/lib/platforms/instagram'
import { createXTweet, createXThread } from '@/lib/platforms/x'

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

    const account = post.account as {
      user_id: string
      platform: string
      access_token: string | null
      threads_user_id: string | null
      instagram_user_id: string | null
      x_user_id: string | null
      x_refresh_token: string | null
    } | null

    // 所有者チェック（IDOR対策）：post.user_id または join した account.user_id が認証ユーザーと一致すること
    const ownsPost =
      (post.user_id && post.user_id === user.id) ||
      (account?.user_id && account.user_id === user.id)
    if (!ownsPost || !account) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    let platformPostId: string

    if (account.platform === 'threads') {
      if (!account.access_token || !account.threads_user_id) {
        return NextResponse.json({ error: 'Threads APIトークンが設定されていません' }, { status: 400 })
      }
      const result = await createThreadsPost(
        { accessToken: account.access_token, userId: account.threads_user_id },
        { text: post.text_content ?? '', imageUrl: post.image_url ?? undefined }
      )
      platformPostId = result.id
    } else if (account.platform === 'instagram') {
      if (!account.access_token || !account.instagram_user_id) {
        return NextResponse.json({ error: 'Instagram APIトークンまたはアカウントIDが設定されていません' }, { status: 400 })
      }
      if (!post.image_url) {
        return NextResponse.json({ error: 'Instagram投稿には画像が必須です' }, { status: 400 })
      }
      const result = await createInstagramPost(
        { accessToken: account.access_token, igUserId: account.instagram_user_id },
        { caption: post.text_content ?? '', imageUrl: post.image_url }
      )
      platformPostId = result.id
    } else if (account.platform === 'x') {
      if (!account.access_token) {
        return NextResponse.json({ error: 'X APIトークンが設定されていません' }, { status: 400 })
      }

      const text = post.text_content ?? ''

      // スレッドモード: "---" 区切りで複数ツイートに分割
      const parts = text.split(/\n---\n/).map((s: string) => s.trim()).filter(Boolean)

      if (parts.length > 1) {
        const results = await createXThread(account.access_token, parts)
        platformPostId = results[0].id
      } else {
        const result = await createXTweet(account.access_token, text)
        platformPostId = result.id
      }
    } else {
      return NextResponse.json({ error: `${account.platform} の投稿は未対応です` }, { status: 400 })
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
