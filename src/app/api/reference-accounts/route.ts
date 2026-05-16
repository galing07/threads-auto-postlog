import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

const ALLOWED_PLATFORMS = new Set(['threads', 'instagram', 'x'])
const MAX_NAME = 100
const MAX_HANDLE = 80
const MAX_NOTES = 1_000

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data, error } = await supabase
      .from('reference_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[reference-accounts GET]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      name?: string
      platform?: string
      handle?: string
      notes?: string
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME) : ''
    if (!name) {
      return NextResponse.json({ error: 'アカウント名は必須です' }, { status: 400 })
    }

    const platform = typeof body.platform === 'string' && ALLOWED_PLATFORMS.has(body.platform)
      ? body.platform
      : 'threads'

    const handle = typeof body.handle === 'string'
      ? body.handle.trim().slice(0, MAX_HANDLE) || null
      : null
    const notes = typeof body.notes === 'string'
      ? body.notes.trim().slice(0, MAX_NOTES) || null
      : null

    const { data, error } = await supabase
      .from('reference_accounts')
      .insert({ user_id: user.id, name, platform, handle, notes })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[reference-accounts POST]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
