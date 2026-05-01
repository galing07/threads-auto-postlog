import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateThreadsText } from '@/lib/ai/text'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { accountId, theme } = await req.json() as { accountId: string; theme: string }
    if (!accountId || !theme) {
      return NextResponse.json({ error: 'accountId と theme は必須です' }, { status: 400 })
    }

    const { data: account, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single()

    if (error || !account) {
      return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 })
    }

    const result = await generateThreadsText({ account, theme })

    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : '生成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
