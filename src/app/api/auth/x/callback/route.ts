import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { exchangeXCode, getXMe } from '@/lib/platforms/x'

function redirectWithError(appUrl: string, code: string) {
  const res = NextResponse.redirect(`${appUrl}/dashboard/accounts?error=${encodeURIComponent(code)}`)
  res.cookies.delete('x_oauth_pending')
  return res
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  if (oauthError) {
    // X からの error コードは安全な短文（access_denied 等）。長さだけ制限して通す
    return redirectWithError(appUrl, oauthError.slice(0, 50))
  }

  if (!code || !state) {
    return redirectWithError(appUrl, 'missing_params')
  }

  const raw = req.cookies.get('x_oauth_pending')?.value
  if (!raw) {
    return redirectWithError(appUrl, 'session_expired')
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
    return redirectWithError(appUrl, 'invalid_session')
  }

  if (pending.state !== state) {
    return redirectWithError(appUrl, 'state_mismatch')
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

    const admin = createAdminClient()

    const postTopics = pending.postTopics
      .split('、')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20)

    const { error: insertError } = await admin.from('accounts').insert({
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

    if (insertError) {
      console.error('[x/callback] insert', insertError.message)
      return redirectWithError(appUrl, 'save_failed')
    }

    const res = NextResponse.redirect(`${appUrl}/dashboard/accounts?connected=x`)
    res.cookies.delete('x_oauth_pending')
    return res
  } catch (e) {
    console.error('[x/callback]', e instanceof Error ? e.message : 'unknown')
    return redirectWithError(appUrl, 'oauth_failed')
  }
}
