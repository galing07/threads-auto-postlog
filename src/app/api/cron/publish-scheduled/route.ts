import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createThreadsPost } from '@/lib/platforms/threads'
import { createInstagramPost } from '@/lib/platforms/instagram'
import { createXTweet, createXThread } from '@/lib/platforms/x'
import type { Post, Account } from '@/types/database'

// Vercel Cron: 15分毎に予約投稿を実行
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date().toISOString()

  const { data: posts, error } = await supabase
    .from('posts')
    .select('*, account:accounts(*)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = await Promise.allSettled(
    (posts ?? []).map(async (post: Post & { account: Account }) => {
      const { account } = post
      const text = post.text_content ?? ''
      const imageUrl = post.image_url ?? undefined

      let platformPostId: string

      if (account.platform === 'threads') {
        if (!account.access_token || !account.threads_user_id) {
          throw new Error('Threadsトークン未設定')
        }
        const result = await createThreadsPost(
          { accessToken: account.access_token, userId: account.threads_user_id },
          { text, imageUrl }
        )
        platformPostId = result.id
      } else if (account.platform === 'instagram') {
        if (!account.access_token || !account.instagram_user_id) {
          throw new Error('Instagramトークン/アカウントID未設定')
        }
        if (!imageUrl) {
          throw new Error('Instagram投稿には画像が必須です')
        }
        const result = await createInstagramPost(
          { accessToken: account.access_token, igUserId: account.instagram_user_id },
          { caption: text, imageUrl }
        )
        platformPostId = result.id
      } else if (account.platform === 'x') {
        if (!account.access_token) {
          throw new Error('Xトークン未設定')
        }
        const parts = text.split(/\n---\n/).map(s => s.trim()).filter(Boolean)
        if (parts.length > 1) {
          const r = await createXThread(account.access_token, parts)
          platformPostId = r[0].id
        } else {
          const r = await createXTweet(account.access_token, text)
          platformPostId = r.id
        }
      } else {
        throw new Error(`${account.platform} の予約投稿は未対応です`)
      }

      await supabase
        .from('posts')
        .update({ status: 'posted', posted_at: now, platform_post_id: platformPostId })
        .eq('id', post.id)

      await supabase.from('post_logs').insert({
        post_id: post.id,
        action: 'posted',
        message: `${account.platform} 予約投稿成功: ${platformPostId}`,
      })

      return { postId: post.id, platform: account.platform, platformId: platformPostId }
    })
  )

  // 失敗を post_logs に記録（status は scheduled のまま：再試行可）
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status === 'rejected') {
        const post = posts![i]
        const message = r.reason instanceof Error ? r.reason.message : String(r.reason)
        await supabase.from('post_logs').insert({
          post_id: post.id,
          action: 'failed',
          message: `予約投稿失敗: ${message}`,
        })
      }
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ processed: posts?.length ?? 0, succeeded, failed })
}
