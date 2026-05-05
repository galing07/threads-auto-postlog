// X API v2 adapter
// Docs: https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets

const X_API_BASE = 'https://api.twitter.com/2'
const X_AUTH_BASE = 'https://twitter.com/i/oauth2'
const X_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'

export const X_SCOPES = 'tweet.write tweet.read users.read offline.access'

export interface XTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

interface XTweetResult {
  id: string
  text: string
}

async function xRequest<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${X_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ title: res.statusText }))
    throw new Error(`X API error ${res.status}: ${JSON.stringify(err)}`)
  }

  return res.json() as Promise<T>
}

export async function createXTweet(
  accessToken: string,
  text: string,
  replyToId?: string
): Promise<XTweetResult> {
  const body: Record<string, unknown> = { text }
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId }

  const result = await xRequest<{ data: XTweetResult }>(
    '/tweets',
    accessToken,
    { method: 'POST', body: JSON.stringify(body) }
  )
  return result.data
}

export async function createXThread(
  accessToken: string,
  parts: string[]
): Promise<XTweetResult[]> {
  const results: XTweetResult[] = []
  for (const text of parts) {
    const replyToId = results.at(-1)?.id
    const tweet = await createXTweet(accessToken, text, replyToId)
    results.push(tweet)
  }
  return results
}

export async function getXMe(accessToken: string) {
  const result = await xRequest<{ data: { id: string; username: string; name: string } }>(
    '/users/me',
    accessToken
  )
  return result.data
}

export async function refreshXToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<XTokens> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  })

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: params.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`X token refresh failed: ${JSON.stringify(err)}`)
  }

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export function buildXAuthUrl(params: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const url = new URL(`${X_AUTH_BASE}/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', X_SCOPES)
  url.searchParams.set('state', params.state)
  url.searchParams.set('code_challenge', params.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

export async function exchangeXCode(params: {
  code: string
  codeVerifier: string
  redirectUri: string
  clientId: string
  clientSecret: string
}): Promise<XTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    client_id: params.clientId,
  })

  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${params.clientId}:${params.clientSecret}`).toString('base64')}`,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`X token exchange failed: ${JSON.stringify(err)}`)
  }

  const data = await res.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Buffer.from(array).toString('base64url')
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Buffer.from(digest).toString('base64url')
}
