// X (Twitter) API v2 adapter
// Docs: https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
// OAuth フロー / 自動リフレッシュは廃止。アクセストークンは手動入力で受け取る運用。

const X_API_BASE = 'https://api.twitter.com/2'
const REQUEST_TIMEOUT_MS = 30_000

interface XTweetResult {
  id: string
  text: string
}

export class XAuthError extends Error {
  constructor(message = 'X access token expired or invalid') {
    super(message)
    this.name = 'XAuthError'
  }
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
    signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[X API]', path, res.status, errText)
    if (res.status === 401 || res.status === 403) {
      throw new XAuthError()
    }
    throw new Error(`X API error (HTTP ${res.status})`)
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

