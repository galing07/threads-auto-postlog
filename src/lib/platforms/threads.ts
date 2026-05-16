// Threads Graph API adapter
// Meta Threads API: https://developers.facebook.com/docs/threads
// すべて Authorization: Bearer で送信し、access_token を URL クエリに露出させない。

const THREADS_API_BASE = 'https://graph.threads.net/v1.0'
const REQUEST_TIMEOUT_MS = 30_000

interface ThreadsCredentials {
  accessToken: string
  userId: string
}

interface CreatePostOptions {
  text: string
  imageUrl?: string
}

interface ThreadsPostResult {
  id: string
}

export class ThreadsAuthError extends Error {
  constructor(message = 'Threads access token expired or invalid') {
    super(message)
    this.name = 'ThreadsAuthError'
  }
}

async function threadsRequest<T>(
  path: string,
  accessToken: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, string> } = {},
): Promise<T> {
  const { method = 'GET', body } = options
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }
  if (method === 'POST' && body) {
    init.headers = { ...init.headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    init.body = new URLSearchParams(body).toString()
  }

  const res = await fetch(`${THREADS_API_BASE}${path}`, init)
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[Threads API]', method, path, res.status, errText)
    if (res.status === 401 || res.status === 403) {
      throw new ThreadsAuthError()
    }
    throw new Error(`Threads API error (HTTP ${res.status})`)
  }
  return res.json() as Promise<T>
}

/**
 * Threads は image_url をサーバー側から fetch するため、SSRF 縮小のため
 * https:// 以外を許可しない。
 */
function assertSafeImageUrl(imageUrl: string) {
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error('Threads の画像URLは https:// で始まる必要があります')
  }
}

export async function createThreadsPost(
  credentials: ThreadsCredentials,
  { text, imageUrl }: CreatePostOptions,
): Promise<ThreadsPostResult> {
  const { accessToken, userId } = credentials

  if (imageUrl) assertSafeImageUrl(imageUrl)

  const mediaType = imageUrl ? 'IMAGE' : 'TEXT'
  const containerBody: Record<string, string> = { media_type: mediaType, text }
  if (imageUrl) containerBody.image_url = imageUrl

  const container = await threadsRequest<{ id: string }>(
    `/${encodeURIComponent(userId)}/threads`,
    accessToken,
    { method: 'POST', body: containerBody },
  )

  const published = await threadsRequest<{ id: string }>(
    `/${encodeURIComponent(userId)}/threads_publish`,
    accessToken,
    { method: 'POST', body: { creation_id: container.id } },
  )

  return { id: published.id }
}

export async function getThreadsProfile(accessToken: string, userId: string) {
  return threadsRequest<{ id: string; username: string; name: string }>(
    `/${encodeURIComponent(userId)}?fields=id,username,name`,
    accessToken,
  )
}

/**
 * Threads long-lived token のリフレッシュ
 * - 24 時間以上経過した long-lived token に対して有効
 * - 新しい access_token と expires_in を返す
 */
export interface ThreadsRefreshResult {
  accessToken: string
  expiresAt: number
}

export async function refreshThreadsToken(token: string): Promise<ThreadsRefreshResult> {
  const res = await threadsRequest<{ access_token: string; expires_in: number }>(
    `/refresh_access_token?grant_type=th_refresh_token`,
    token,
  )
  return {
    accessToken: res.access_token,
    expiresAt: Date.now() + res.expires_in * 1000,
  }
}
