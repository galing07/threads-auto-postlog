import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : '取得に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      name: string
      persona: string
      tone: string
      targetAudience: string
      postTopics: string[]
      accessToken: string
      threadsUserId: string
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        platform: 'threads',
        name: body.name,
        persona: body.persona,
        tone: body.tone,
        target_audience: body.targetAudience,
        post_topics: body.postTopics,
        access_token: body.accessToken,
        threads_user_id: body.threadsUserId,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : '作成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
