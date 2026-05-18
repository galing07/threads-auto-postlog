// X (Twitter) API v2 adapter — OAuth 1.0a User Context 方式
// Developer Portal の「Keys and tokens」でボタン取得できる4キーで投稿する。
// （ブラウザ認可フロー不要。API Key / API Key Secret / Access Token / Access Token Secret）
// Docs: https://developer.twitter.com/en/docs/authentication/oauth-1-0a

import crypto from 'crypto'

const X_API_BASE = 'https://api.twitter.com/2'
const REQUEST_TIMEOUT_MS = 30_000

export interface XCredentials {
  apiKey: string        // Consumer / API Key
  apiSecret: string     // Consumer / API Key Secret
  accessToken: string   // Access Token
  accessSecret: string  // Access Token Secret
}

interface XTweetResult {
  id: string
  text: string
}

export class XAuthError extends Error {
  constructor(message = 'X 認証に失敗しました（4キーを確認してください）') {
    super(message)
    this.name = 'XAuthError'
  }
}

// RFC3986 パーセントエンコード
function pctEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    c => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

/**
 * OAuth 1.0a Authorization ヘッダを生成。
 * JSON body の場合、署名ベース文字列には oauth_* パラメータのみ含める（body は除外）。
 */
function buildOAuthHeader(
  method: 'GET' | 'POST',
  url: string,
  cred: XCredentials,
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: cred.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: cred.accessToken,
    oauth_version: '1.0',
  }

  const paramStr = Object.keys(oauth)
    .sort()
    .map(k => `${pctEncode(k)}=${pctEncode(oauth[k])}`)
    .join('&')

  const baseString = `${method}&${pctEncode(url)}&${pctEncode(paramStr)}`
  const signingKey = `${pctEncode(cred.apiSecret)}&${pctEncode(cred.accessSecret)}`
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')

  const headerParams: Record<string, string> = { ...oauth, oauth_signature: signature }
  return (
    'OAuth ' +
    Object.keys(headerParams)
      .sort()
      .map(k => `${pctEncode(k)}="${pctEncode(headerParams[k])}"`)
      .join(', ')
  )
}

async function xPost<T>(path: string, cred: XCredentials, body: unknown): Promise<T> {
  const url = `${X_API_BASE}${path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: buildOAuthHeader('POST', url, cred),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[X API]', 'POST', path, res.status, errText)
    if (res.status === 401 || res.status === 403) throw new XAuthError()
    throw new Error(`X API error (HTTP ${res.status})`)
  }
  return res.json() as Promise<T>
}

async function xGet<T>(path: string, cred: XCredentials): Promise<T> {
  const url = `${X_API_BASE}${path}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: buildOAuthHeader('GET', url, cred) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[X API]', 'GET', path, res.status, errText)
    if (res.status === 401 || res.status === 403) throw new XAuthError()
    throw new Error(`X API error (HTTP ${res.status})`)
  }
  return res.json() as Promise<T>
}

export async function createXTweet(
  cred: XCredentials,
  text: string,
  replyToId?: string,
): Promise<XTweetResult> {
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }
  const result = await xPost<{ data: XTweetResult }>('/tweets', cred, body)
  return result.data
}

export async function createXThread(
  cred: XCredentials,
  parts: string[],
): Promise<XTweetResult[]> {
  const results: XTweetResult[] = []
  for (const text of parts) {
    const replyToId = results.at(-1)?.id
    results.push(await createXTweet(cred, text, replyToId))
  }
  return results
}

export async function getXMe(
  cred: XCredentials,
): Promise<{ id: string; username: string; name: string }> {
  const result = await xGet<{ data: { id: string; username: string; name: string } }>(
    '/users/me',
    cred,
  )
  return result.data
}
