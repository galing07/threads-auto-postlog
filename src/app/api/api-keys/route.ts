import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { maskApiKey } from '@/lib/ai/api-keys'

const MAX_KEY_LEN = 500

interface ResponseShape {
  openrouter_masked: string | null
  openai_masked: string | null
  has_openrouter: boolean
  has_openai: boolean
  updated_at: string | null
}

function emptyResponse(): ResponseShape {
  return {
    openrouter_masked: null,
    openai_masked: null,
    has_openrouter: false,
    has_openai: false,
    updated_at: null,
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data } = await supabase
      .from('user_api_keys')
      .select('openrouter_key, openai_key, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!data) return NextResponse.json(emptyResponse())

    const orKey = typeof data.openrouter_key === 'string' && data.openrouter_key.trim() ? data.openrouter_key.trim() : null
    const oaKey = typeof data.openai_key === 'string' && data.openai_key.trim() ? data.openai_key.trim() : null

    const resp: ResponseShape = {
      openrouter_masked: maskApiKey(orKey),
      openai_masked: maskApiKey(oaKey),
      has_openrouter: !!orKey,
      has_openai: !!oaKey,
      updated_at: data.updated_at ?? null,
    }
    return NextResponse.json(resp)
  } catch (e) {
    console.error('[api-keys GET]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

function clamp(v: unknown, fallback?: string | null): string | null | undefined {
  // undefined → 既存値を保持（パッチ的挙動）
  if (v === undefined) return fallback
  if (v === null) return null
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_KEY_LEN)
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      openrouterKey?: unknown
      openaiKey?: unknown
    }

    // 各キーは clamp 結果が undefined（フィールド未指定）なら既存値を保持
    const { data: existing } = await supabase
      .from('user_api_keys')
      .select('openrouter_key, openai_key')
      .eq('user_id', user.id)
      .maybeSingle()

    const openrouterKey = clamp(body.openrouterKey, existing?.openrouter_key ?? null)
    const openaiKey = clamp(body.openaiKey, existing?.openai_key ?? null)

    const { error } = await supabase
      .from('user_api_keys')
      .upsert({
        user_id: user.id,
        openrouter_key: openrouterKey,
        openai_key: openaiKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (error) throw error

    const resp: ResponseShape = {
      openrouter_masked: maskApiKey(openrouterKey ?? null),
      openai_masked: maskApiKey(openaiKey ?? null),
      has_openrouter: !!openrouterKey,
      has_openai: !!openaiKey,
      updated_at: new Date().toISOString(),
    }
    return NextResponse.json(resp)
  } catch (e) {
    console.error('[api-keys PUT]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
