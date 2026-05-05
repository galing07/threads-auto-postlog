import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  buildXAuthUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from '@/lib/platforms/x'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

  const body = await req.json() as {
    name?: string
    persona?: string
    tone?: string
    targetAudience?: string
    postTopics?: string
  }

  const clientId = process.env.X_CLIENT_ID
  const clientSecret = process.env.X_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'X_CLIENT_ID / X_CLIENT_SECRET が未設定です' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${appUrl}/api/auth/x/callback`
  const state = crypto.randomUUID()
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const pendingData = JSON.stringify({
    name: body.name ?? '',
    persona: body.persona ?? '',
    tone: body.tone ?? 'friendly',
    targetAudience: body.targetAudience ?? '',
    postTopics: body.postTopics ?? '',
    state,
    userId: user.id,
    codeVerifier,
  })

  const authUrl = buildXAuthUrl({ clientId, redirectUri, state, codeChallenge })

  const res = NextResponse.json({ url: authUrl })
  res.cookies.set('x_oauth_pending', pendingData, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return res
}
