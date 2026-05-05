import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

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
    console.error('[reference-accounts GET]', e)
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { name, platform = 'threads', handle, notes } = await req.json() as {
      name?: string
      platform?: string
      handle?: string
      notes?: string
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: 'アカウント名は必須です' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('reference_accounts')
      .insert({ user_id: user.id, name: name.trim(), platform, handle: handle?.trim() || null, notes: notes?.trim() || null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[reference-accounts POST]', e)
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
