import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  // ユーザー固有のMeta App設定を取得
  const { data: metaApp } = await supabase
    .from('user_meta_apps')
    .select('threads_client_id')
    .eq('user_id', user.id)
    .single()

  if (!metaApp?.threads_client_id) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=meta_not_configured`)
  }

  const { searchParams } = new URL(req.url)
  const name = searchParams.get('name') ?? ''
  const persona = searchParams.get('persona') ?? ''
  const tone = searchParams.get('tone') ?? 'friendly'
  const targetAudience = searchParams.get('targetAudience') ?? ''
  const postTopics = searchParams.get('postTopics') ?? ''

  const state = crypto.randomUUID()

  // cookieにアカウント情報 + userId を保存（callback で使う）
  const pendingData = JSON.stringify({
    name,
    persona,
    tone,
    targetAudience,
    postTopics,
    state,
    userId: user.id,
  })

  const redirectUri = `${appUrl}/api/auth/threads/callback`

  const authUrl = new URL('https://threads.net/oauth/authorize')
  authUrl.searchParams.set('client_id', metaApp.threads_client_id)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'threads_basic,threads_content_publish')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl.toString())
  res.cookies.set('threads_oauth_pending', pendingData, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return res
}
