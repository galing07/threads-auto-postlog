import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

const MAX_LEN = 4_000

interface PromptSettings {
  text_extra: string | null
  image_extra: string | null
  themes_extra: string | null
  updated_at?: string
}

const EMPTY: PromptSettings = {
  text_extra: null,
  image_extra: null,
  themes_extra: null,
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_prompt_settings')
      .select('text_extra, image_extra, themes_extra, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error

    return NextResponse.json(data ?? EMPTY)
  } catch (e) {
    console.error('[prompts GET]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

function clamp(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_LEN)
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      textExtra?: unknown
      imageExtra?: unknown
      themesExtra?: unknown
    }

    const payload = {
      user_id: user.id,
      text_extra: clamp(body.textExtra),
      image_extra: clamp(body.imageExtra),
      themes_extra: clamp(body.themesExtra),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('user_prompt_settings')
      .upsert(payload, { onConflict: 'user_id' })
      .select('text_extra, image_extra, themes_extra, updated_at')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[prompts PUT]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
