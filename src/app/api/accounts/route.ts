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
      platform?: 'threads' | 'tiktok' | 'instagram' | 'x'
      name: string
      persona: string
      tone: string
      targetAudience: string
      postTopics: string[] | string
      accessToken?: string
      threadsUserId?: string
      heygenAvatarId?: string
      heygenVoiceId?: string
    }

    const platform = body.platform ?? 'threads'

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name は必須です' }, { status: 400 })
    }

    if (platform === 'tiktok' && (!body.heygenAvatarId?.trim() || !body.heygenVoiceId?.trim())) {
      return NextResponse.json(
        { error: 'TikTokアカウントには HeyGen avatar_id と voice_id が必要です' },
        { status: 400 },
      )
    }

    const postTopics = Array.isArray(body.postTopics)
      ? body.postTopics
      : (body.postTopics ?? '').split('、').map(s => s.trim()).filter(Boolean)

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        platform,
        name: body.name,
        persona: body.persona,
        tone: body.tone,
        target_audience: body.targetAudience,
        post_topics: postTopics,
        access_token: body.accessToken ?? null,
        threads_user_id: body.threadsUserId ?? null,
        heygen_avatar_id: body.heygenAvatarId ?? null,
        heygen_voice_id: body.heygenVoiceId ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[accounts POST]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 })
  }
}
