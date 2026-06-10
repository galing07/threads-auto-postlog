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
  /**
   * container 作成後・threads_publish 前後で発生した auth エラーの場合、既に作成済みの
   * コンテナ ID を載せる。呼び出し側（publishers.ts）はこれを使い、再試行時に
   * コンテナを作り直さず threads_publish のみ再実行できる（孤立コンテナの量産を防ぐ）。
   */
  containerId?: string

  constructor(message = 'Threads access token expired or invalid', containerId?: string) {
    super(message)
    this.name = 'ThreadsAuthError'
    this.containerId = containerId
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
    // Graph API のエラー本文から、機密を含まない説明文だけを抽出してログ＋例外に載せる。
    // 形式: { error: { message, type, code, error_subcode, error_user_title, error_user_msg } }
    // トークン等の機密は元々ボディに含まれない（error.message / error_user_msg のみ扱う）。
    const raw = await res.text().catch(() => '')
    let detail = ''
    try {
      const j = JSON.parse(raw) as {
        error?: { message?: string; error_user_title?: string; error_user_msg?: string }
      }
      detail = (j.error?.error_user_msg || j.error?.message || j.error?.error_user_title || '')
        .toString()
        .slice(0, 200)
    } catch {
      // JSON でない場合は先頭のみ
      detail = raw.replace(/\s+/g, ' ').slice(0, 200)
    }
    console.error('[Threads API]', method, path, res.status, detail)
    if (res.status === 401 || res.status === 403) {
      throw new ThreadsAuthError(detail ? `Threads 認証/権限エラー: ${detail}` : undefined)
    }
    throw new Error(`Threads API error (HTTP ${res.status})${detail ? `: ${detail}` : ''}`)
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

interface CreatePostExtras {
  /**
   * 既存のコンテナ ID。指定された場合はコンテナ作成をスキップし、threads_publish
   * のみ実行する（前回の publish 失敗で作成済みのコンテナを再利用するため）。
   */
  containerId?: string
  /**
   * コンテナ作成直後（threads_publish 前）に呼ばれるコールバック。呼び出し元は
   * ここで containerId を保持し、再試行時に再利用できるようにする。
   * （Instagram Reels の onContainerCreated と同じ意図）
   */
  onContainerCreated?: (containerId: string) => void
}

export async function createThreadsPost(
  credentials: ThreadsCredentials,
  { text, imageUrl }: CreatePostOptions,
  extras: CreatePostExtras = {},
): Promise<ThreadsPostResult> {
  const { accessToken, userId } = credentials
  const { containerId: existingContainerId, onContainerCreated } = extras

  if (imageUrl) assertSafeImageUrl(imageUrl)

  // 既存コンテナがあれば作成をスキップして再利用する（孤立コンテナの量産を防ぐ）。
  let containerId: string
  if (existingContainerId) {
    containerId = existingContainerId
  } else {
    const mediaType = imageUrl ? 'IMAGE' : 'TEXT'
    const containerBody: Record<string, string> = { media_type: mediaType, text }
    if (imageUrl) containerBody.image_url = imageUrl

    const container = await threadsRequest<{ id: string }>(
      `/${encodeURIComponent(userId)}/threads`,
      accessToken,
      { method: 'POST', body: containerBody },
    )
    containerId = container.id
    // 公開前に containerId を呼び出し元へ伝える。publish が auth エラーで落ちても
    // 呼び出し元はこの ID で threads_publish のみ再試行できる。
    onContainerCreated?.(containerId)
  }

  try {
    const published = await threadsRequest<{ id: string }>(
      `/${encodeURIComponent(userId)}/threads_publish`,
      accessToken,
      { method: 'POST', body: { creation_id: containerId } },
    )
    return { id: published.id }
  } catch (e) {
    // threads_publish が auth エラーで失敗した場合、作成済みコンテナ ID を載せ直して
    // throw する。呼び出し元はトークン更新後にコンテナを再利用して再試行する。
    if (e instanceof ThreadsAuthError) {
      throw new ThreadsAuthError(e.message, containerId)
    }
    throw e
  }
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
