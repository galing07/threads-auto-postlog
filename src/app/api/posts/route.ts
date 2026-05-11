import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const accountId = searchParams.get('accountId')
    const status = searchParams.get('status')

    const limitParam = searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 200

    let query = supabase
      .from('posts')
      .select('*, account:accounts(id, name, platform, persona)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (accountId) query = query.eq('account_id', accountId)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
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
      accountId?: string
      textContent: string
      imageUrl?: string
      imagePrompt?: string
      videoUrl?: string
      theme?: string
      summary?: string
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        account_id: body.accountId ?? null,
        text_content: body.textContent,
        image_url: body.imageUrl ?? null,
        image_prompt: body.imagePrompt ?? null,
        video_url: body.videoUrl ?? null,
        theme: body.theme ?? null,
        status: 'draft',
        summary: body.summary ?? null,
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
    const message = e instanceof Error ? e.message : '保存に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
