// X (Twitter) OAuth 2.0 Authorization Code with PKCE アダプタ
//
// ブラウザ認可フロー（TikTok / YouTube と同じ方式）:
//   1. /api/auth/x        … state + PKCE(code_verifier/challenge) を Cookie に保存し認可URLへ
//   2. /api/auth/x/callback … code を access_token / refresh_token に交換して暗号化保存
//
// 投稿は OAuth 2.0 User Context（Bearer）で行う（src/lib/platforms/x.ts の XAuth='oauth2'）。
// access_token は約2時間で失効するため refresh_token で更新する（X は refresh_token をローテートする）。
//
// 必須環境変数:
//   - X_OAUTH_CLIENT_ID     … X Developer Portal の OAuth 2.0 Client ID
//   - X_OAUTH_CLIENT_SECRET … OAuth 2.0 Client Secret（Confidential client）
//   - X_OAUTH_REDIRECT_URI  … Portal に登録した Callback URI（/api/auth/x/callback）
//
// Docs: https://developer.x.com/en/docs/authentication/oauth-2-0/authorization-code

import 'server-only'
import crypto from 'crypto'

export const X_OAUTH_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize'
const X_OAUTH_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'
const REQUEST_TIMEOUT_MS = 30_000

// tweet.write: 投稿 / media.write: 画像アップロード / users.read: /users/me /
// offline.access: refresh_token を得る（これが無いと再連携が必要になる）
export const X_OAUTH_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'media.write',
  'offline.access',
]

export class XOAuthError extends Error {
  constructor(message = 'X OAuth エラー') {
    super(message)
    this.name = 'XOAuthError'
  }
}

/** PKCE: 43〜128 文字の URL-safe な code_verifier を生成 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** PKCE: code_verifier から S256 の code_challenge を導出 */
export function codeChallengeS256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

export interface XTokenResult {
  accessToken: string
  refreshToken: string
  /** epoch ミリ秒 */
  expiresAt: number
  scope: string
}

function parseTokenResponse(json: unknown): XTokenResult {
  const j = json as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
  }
  if (!j.access_token || !j.refresh_token) {
    // offline.access が無いと refresh_token が返らない。連携時に必ず付与する想定。
    throw new XOAuthError('X トークンの取得に失敗しました（access_token / refresh_token が不足）')
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in ?? 7200) * 1000,
    scope: j.scope ?? '',
  }
}

/** 認可コードを access_token / refresh_token と交換（PKCE: code_verifier 必須） */
export async function exchangeXCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<XTokenResult> {
  if (!redirectUri || !/^https?:\/\//.test(redirectUri)) {
    throw new XOAuthError('X_OAUTH_REDIRECT_URI が未設定または不正です')
  }
  const res = await fetch(X_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    // トークンエンドポイントのエラーボディは秘密をエコーし得るため status のみ記録
    console.error('[X OAuth]', 'code exchange failed', res.status)
    throw new XOAuthError('X 認可コードの交換に失敗しました')
  }
  return parseTokenResponse(await res.json())
}

/** refresh_token で access_token を更新（X は refresh_token をローテートするので両方保存し直す） */
export async function refreshXToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<XTokenResult> {
  const res = await fetch(X_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    console.error('[X OAuth]', 'refresh failed', res.status)
    throw new XOAuthError('X トークンのリフレッシュに失敗しました')
  }
  return parseTokenResponse(await res.json())
}
