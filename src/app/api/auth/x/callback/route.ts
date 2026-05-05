import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeXCode, getXMe } from '@/lib/platforms/x'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (error) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=missing_params`)
  }

  const raw = req.cookies.get('x_oauth_pending')?.value
  if (!raw) {
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
    codeVerifier: string
  }

  try {
    pending = JSON.parse(raw)
  } catch {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=invalid_session`)
  }

  if (pending.state !== state) {
    return NextResponse.redirect(`${appUrl}/dashboard/accounts?error=state_mismatch`)
  }

  const clientId = process.env.X_CLIENT_ID!
  const clientSecret = process.env.X_CLIENT_SECRET!
  const redirectUri = `${appUrl}/api/auth/x/callback`

  try {
    const tokens = await exchangeXCode({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri,
      clientId,
      clientSecret,
    })

    const me = await getXMe(tokens.accessToken)

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const postTopics = pending.postTopics
      .split('、')
      .map(s => s.trim())
      .filter(Boolean)

    await admin.from('accounts').insert({
      user_id: pending.userId,
      platform: 'x',
      name: pending.name || me.name,
      persona: pending.persona,
      tone: pending.tone,
      target_audience: pending.targetAudience,
      post_topics: postTopics,
      access_token: tokens.accessToken,
      x_user_id: me.id,
      x_refresh_token: tokens.refreshToken,
      token_expires_at: new Date(tokens.expiresAt).toISOString(),
    })

    const res = NextResponse.redirect(`${appUrl}/dashboard/accounts?connected=x`)
    res.cookies.delete('x_oauth_pending')
    return res
  } catch (e) {
    console.error('[x/callback]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.redirect(
      `${appUrl}/dashboard/accounts?error=${encodeURIComponent(e instanceof Error ? e.message : 'unknown')}`
    )
  }
}
