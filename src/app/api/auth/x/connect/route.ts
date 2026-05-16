import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  buildXAuthUrl,
  generateCodeVerifier,
  generateCodeChallenge,
} from '@/lib/platforms/x'

const MAX_NAME = 100
const MAX_PERSONA = 200
const MAX_TONE = 50
const MAX_AUDIENCE = 200
const MAX_TOPICS = 500

function clamp(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback
  const trimmed = v.trim()
  return trimmed ? trimmed.slice(0, max) : fallback
}

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
    name: clamp(body.name, MAX_NAME),
    persona: clamp(body.persona, MAX_PERSONA),
    tone: clamp(body.tone, MAX_TONE, 'friendly'),
    targetAudience: clamp(body.targetAudience, MAX_AUDIENCE),
    postTopics: clamp(body.postTopics, MAX_TOPICS),
    state,
    userId: user.id,
    codeVerifier,
  })

  // 4KB を超えると HTTP 431 の原因になるので予防
  if (pendingData.length > 3500) {
    return NextResponse.json({ error: '入力が長すぎます' }, { status: 400 })
  }

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
