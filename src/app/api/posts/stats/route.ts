import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

type StatusKey = 'draft' | 'posted' | 'failed'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    // 自分の投稿だけのstatusカラムを取得（RLSと併せて二重防御）
    const { data, error } = await supabase
      .from('posts')
      .select('status')
      .eq('user_id', user.id)

    if (error) throw error

    const counts: Record<StatusKey, number> = { draft: 0, posted: 0, failed: 0 }
    for (const row of data ?? []) {
      const s = row.status as string
      if (s === 'draft' || s === 'posted' || s === 'failed') {
        counts[s]++
      }
    }

    return NextResponse.json(counts)
  } catch (e) {
    console.error('[posts/stats]', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}
