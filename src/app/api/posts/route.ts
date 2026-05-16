import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

// account の機密カラム (access_token / *_secret / refresh_token) は絶対に投稿一覧の join 経由で
// クライアントへ流出させないため、明示列のみ select する
const ACCOUNT_PUBLIC_COLS = 'id, name, platform, persona'

const MAX_TEXT_LEN = 5_000
const MAX_THEME_LEN = 200
const MAX_SUMMARY_LEN = 300
const MAX_URL_LEN = 2048
const DEFAULT_LIMIT = 200
const MAX_LIMIT = 200

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')
    const status = searchParams.get('status')

    const limitParam = parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT

    let query = supabase
      .from('posts')
      .select(`*, account:accounts(${ACCOUNT_PUBLIC_COLS})`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (accountId) {
      // 自分が所有する accountId であることを明示的に検証（IDOR の二重防御）
      const { data: owned } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!owned) {
        return NextResponse.json([])
      }
      query = query.eq('account_id', accountId)
    }
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data)
  } catch (e) {
    console.error('[posts GET]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      accountId?: string
      textContent?: string
      imageUrl?: string
      imagePrompt?: string
      theme?: string
      summary?: string
    }

    const textContent = clampStr(body.textContent, MAX_TEXT_LEN)
    if (!textContent) {
      return NextResponse.json({ error: '本文は必須です' }, { status: 400 })
    }

    // accountId 指定時は所有者検証
    let accountId: string | null = null
    if (body.accountId) {
      const { data: owned } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', body.accountId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!owned) {
        return NextResponse.json({ error: '指定されたアカウントが見つかりません' }, { status: 404 })
      }
      accountId = owned.id
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        account_id: accountId,
        text_content: textContent,
        image_url: clampStr(body.imageUrl, MAX_URL_LEN),
        image_prompt: clampStr(body.imagePrompt, MAX_TEXT_LEN),
        theme: clampStr(body.theme, MAX_THEME_LEN),
        status: 'draft',
        summary: clampStr(body.summary, MAX_SUMMARY_LEN),
      })
      .select()
      .single()

    if (error) throw error

    await supabase.from('post_logs').insert({
      post_id: data.id,
      action: 'generated',
      message: '下書き保存',
    })

    return NextResponse.json(data)
  } catch (e) {
    console.error('[posts POST]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
