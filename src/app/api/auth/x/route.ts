// X OAuth 2.0 (PKCE) 開始エンドポイント (GET /api/auth/x)
//
// フロー:
//   1. ログイン中ユーザーを Supabase セッションから取得
//   2. CSRF 用 state と PKCE code_verifier を生成 → HttpOnly Cookie に保存
//   3. X の認可 URL（code_challenge=S256 付き）へリダイレクト
//
// 資格情報の保存場所:
//   - Client ID / Client Secret: 環境変数ではなく「ユーザーごとにアプリ内 DB」(user_api_keys)
//     に暗号化保存（設定/連携パネルで入力）。納品先クライアントが自分で設定できるようにするため
//     （Instagram の BYOK と同じ運用）。
//   - X_OAUTH_REDIRECT_URI（任意）: 未設定なら NEXT_PUBLIC_APP_URL から自動生成。
//     X Developer Portal の Callback URI に、連携パネルが表示する実値を完全一致で登録すること。
//   - ENCRYPTION_KEY: token 暗号化に使う鍵（callback で使用）。

import 'server-only'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchXOAuthCredentials } from '@/lib/ai/api-keys'
import {
  X_OAUTH_AUTHORIZE_URL,
  X_OAUTH_SCOPES,
  generateCodeVerifier,
  codeChallengeS256,
} from '@/lib/platforms/x-oauth'

const X_OAUTH_STATE_COOKIE = 'x_oauth_state'
const X_OAUTH_VERIFIER_COOKIE = 'x_oauth_verifier'
const X_OAUTH_MAX_AGE_SEC = 600 // 10 分

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://threads-auto-post-umber.vercel.app'
}

/**
 * X Developer Portal の Callback URI に登録すべき実値（実フローが送る redirect_uri と同一）。
 * 環境変数ではなくアプリURLから生成し、連携パネルにこの値を表示してコピー登録させる。
 * 単一情報源として callback / config からも参照する。
 */
export function xRedirectUri(): string {
  return process.env.X_OAUTH_REDIRECT_URI ?? `${appUrl()}/api/auth/x/callback`
}

function redirectToAccounts(reason: string): NextResponse {
  const url = new URL('/dashboard/accounts', appUrl())
  url.searchParams.set('platform', 'x')
  url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', appUrl()))
  }

  // Client ID / Secret は環境変数ではなくユーザーごとに DB 保存（BYOK）。
  // callback でトークン交換に secret が必須なので、開始時点で両方揃っているか確認する。
  const { clientId, clientSecret } = await fetchXOAuthCredentials()
  if (!clientId || !clientSecret) {
    return redirectToAccounts('app_not_configured')
  }

  const state = crypto.randomBytes(24).toString('hex')
  const verifier = generateCodeVerifier()
  const challenge = codeChallengeS256(verifier)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: xRedirectUri(),
    scope: X_OAUTH_SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  const res = NextResponse.redirect(`${X_OAUTH_AUTHORIZE_URL}?${params.toString()}`)
  // OAuth の戻り（x.com → 当サイトへの cross-site トップレベル遷移）でも確実に Cookie が
  // 送られるよう SameSite=None(secure必須) を使う（Instagram で Lax の取りこぼしを経験済み）。
  const cookieBase = {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    path: '/',
    maxAge: X_OAUTH_MAX_AGE_SEC,
  }
  res.cookies.set(X_OAUTH_STATE_COOKIE, state, cookieBase)
  res.cookies.set(X_OAUTH_VERIFIER_COOKIE, verifier, cookieBase)
  return res
}
