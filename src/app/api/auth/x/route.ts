// X OAuth 2.0 (PKCE) 開始エンドポイント (GET /api/auth/x)
//
// フロー:
//   1. ログイン中ユーザーを Supabase セッションから取得
//   2. CSRF 用 state と PKCE code_verifier を生成 → HttpOnly Cookie に保存
//   3. X の認可 URL（code_challenge=S256 付き）へリダイレクト
//
// 必須環境変数:
//   - X_OAUTH_CLIENT_ID     … OAuth 2.0 Client ID
//   - X_OAUTH_CLIENT_SECRET … （callback で使用）
//   - X_OAUTH_REDIRECT_URI  … Portal 登録の Callback URI（/api/auth/x/callback）
//   - ENCRYPTION_KEY        … refresh_token 暗号化（callback で使用）

import 'server-only'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  X_OAUTH_AUTHORIZE_URL,
  X_OAUTH_SCOPES,
  generateCodeVerifier,
  codeChallengeS256,
} from '@/lib/platforms/x-oauth'

const X_OAUTH_STATE_COOKIE = 'x_oauth_state'
const X_OAUTH_VERIFIER_COOKIE = 'x_oauth_verifier'
const X_OAUTH_MAX_AGE_SEC = 600 // 10 分

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const clientId = process.env.X_OAUTH_CLIENT_ID
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI
  if (!clientId || !redirectUri) {
    console.error('[x/oauth] X_OAUTH_CLIENT_ID/REDIRECT_URI が未設定です')
    return NextResponse.json(
      { error: 'X 連携の設定が不足しています' },
      { status: 500 },
    )
  }

  const state = crypto.randomBytes(24).toString('hex')
  const verifier = generateCodeVerifier()
  const challenge = codeChallengeS256(verifier)

  const cookieStore = await cookies()
  const cookieBase = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: X_OAUTH_MAX_AGE_SEC,
  }
  cookieStore.set(X_OAUTH_STATE_COOKIE, state, cookieBase)
  cookieStore.set(X_OAUTH_VERIFIER_COOKIE, verifier, cookieBase)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: X_OAUTH_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  return NextResponse.redirect(`${X_OAUTH_AUTHORIZE_URL}?${params.toString()}`)
}
