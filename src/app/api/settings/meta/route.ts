import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data } = await supabase
      .from('user_meta_apps')
      .select('threads_client_id, threads_client_secret')
      .eq('user_id', user.id)
      .single()

    if (!data) return NextResponse.json({ configured: false })

    return NextResponse.json({
      configured: true,
      clientId: data.threads_client_id,
      // シークレットは末尾4文字だけ返す
      clientSecretMask: '••••••••' + data.threads_client_secret.slice(-4),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { clientId, clientSecret } = await req.json() as {
      clientId?: string
      clientSecret?: string
    }

    if (!clientId?.trim() || !clientSecret?.trim()) {
      return NextResponse.json({ error: 'クライアントIDとシークレットは必須です' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_meta_apps')
      .upsert(
        {
          user_id: user.id,
          threads_client_id: clientId.trim(),
          threads_client_secret: clientSecret.trim(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'エラーが発生しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
