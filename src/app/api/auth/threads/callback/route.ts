import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=cancelled`)
  }

  const pendingCookie = req.cookies.get('threads_oauth_pending')?.value
  if (!pendingCookie) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=session_expired`)
  }

  let pending: {
    name: string
    persona: string
    tone: string
    targetAudience: string
    postTopics: string
    state: string
    userId: string
    clientId: string
    clientSecret: string
  }
  try {
    pending = JSON.parse(pendingCookie)
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_state`)
  }

  if (pending.state !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_state`)
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== pending.userId) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  const { clientId, clientSecret } = pending
  const redirectUri = `${appUrl}/api/auth/threads/callback`

  try {
    // Step 1: code → 短期アクセストークン
    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokenData = await tokenRes.json() as {
      access_token?: string
      user_id?: number
      error_message?: string
    }

    if (!tokenData.access_token || !tokenData.user_id) {
      // 機密の漏洩を避けるため詳細はログに出さない
      console.error('Token exchange failed:', { hasAccessToken: !!tokenData.access_token, hasUserId: !!tokenData.user_id })
      return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=token_failed`)
    }

    const shortToken = tokenData.access_token
    const threadsUserId = String(tokenData.user_id)

    // Step 2: 短期 → 長期トークン（60日有効）
    // client_secret はクエリではなく POST body に入れる（URL 経由の漏洩防止）
    const longTokenRes = await fetch('https://graph.threads.net/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'th_exchange_token',
        client_secret: clientSecret,
        access_token: shortToken,
      }),
    })
    const longTokenData = await longTokenRes.json() as {
      access_token?: string
      expires_in?: number
    }
    const accessToken = longTokenData.access_token ?? shortToken

    const postTopics = pending.postTopics
      ? pending.postTopics.split('、').map(s => s.trim()).filter(Boolean)
      : []

    const { error: dbError } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        platform: 'threads',
        name: pending.name,
        persona: pending.persona,
        tone: pending.tone,
        target_audience: pending.targetAudience,
        post_topics: postTopics,
        access_token: accessToken,
        threads_user_id: threadsUserId,
        threads_client_id: clientId,
        threads_client_secret: clientSecret,
      })

    if (dbError) {
      console.error('DB insert failed:', { code: dbError.code, message: dbError.message })
      return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=db_failed`)
    }

    const res = NextResponse.redirect(`${appUrl}/dashboard/accounts?success=1`)
    res.cookies.delete('threads_oauth_pending')
    return res

  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    console.error('OAuth callback error:', message)
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=unknown`)
  }
}
