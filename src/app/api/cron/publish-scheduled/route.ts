import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createThreadsPost } from '@/lib/platforms/threads'
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
      if (!account.access_token || !account.threads_user_id) {
        throw new Error('トークン未設定')
      }

      const result = await createThreadsPost(
        { accessToken: account.access_token, userId: account.threads_user_id },
        { text: post.text_content ?? '', imageUrl: post.image_url ?? undefined }
      )

      await supabase
        .from('posts')
        .update({ status: 'posted', posted_at: now, platform_post_id: result.id })
        .eq('id', post.id)

      await supabase.from('post_logs').insert({
        post_id: post.id,
        action: 'posted',
        message: `予約投稿成功: ${result.id}`,
      })

      return { postId: post.id, platformId: result.id }
    })
  )

  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed = results.filter(r => r.status === 'rejected').length

  return NextResponse.json({ processed: posts?.length ?? 0, succeeded, failed })
}
