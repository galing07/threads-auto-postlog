// Instagram Graph API adapter
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
// Token はすべて Authorization: Bearer ヘッダーで送信（URL query への露出を避ける）

const IG_API_BASE = 'https://graph.facebook.com/v21.0'
const REQUEST_TIMEOUT_MS = 30_000

interface InstagramCredentials {
  accessToken: string
  igUserId: string
}

interface CreatePostOptions {
  caption: string
  imageUrl: string
}

interface InstagramPostResult {
  id: string
}

export class InstagramAuthError extends Error {
  constructor(message = 'Instagram access token expired or invalid') {
    super(message)
    this.name = 'InstagramAuthError'
  }
}

async function igRequest<T>(
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

  const res = await fetch(`${IG_API_BASE}${path}`, init)
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[Instagram API]', method, path, res.status, errText)
    if (res.status === 401 || res.status === 403) {
      throw new InstagramAuthError()
    }
    throw new Error(`Instagram API error (HTTP ${res.status})`)
  }
  return res.json() as Promise<T>
}

/**
 * Instagram Business Account に画像+キャプションを投稿
 * 2-step: メディアコンテナ作成 → 公開
 */
export async function createInstagramPost(
  credentials: InstagramCredentials,
  { caption, imageUrl }: CreatePostOptions,
): Promise<InstagramPostResult> {
  const { accessToken, igUserId } = credentials

  if (!imageUrl) {
    throw new Error('Instagramは画像が必須です')
  }
  // Instagram の Graph API は image_url をサーバ側から fetch するため、https のみ受け付ける（SSRF縮小）
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error('Instagram の画像URLは https:// で始まる必要があります')
  }

  const container = await igRequest<{ id: string }>(
    `/${encodeURIComponent(igUserId)}/media`,
    accessToken,
    { method: 'POST', body: { image_url: imageUrl, caption } },
  )

  const published = await igRequest<{ id: string }>(
    `/${encodeURIComponent(igUserId)}/media_publish`,
    accessToken,
    { method: 'POST', body: { creation_id: container.id } },
  )

  return { id: published.id }
}

/**
 * Token から接続済みの Instagram Business Account ID を取得
 */
export async function fetchInstagramUserId(accessToken: string): Promise<string> {
  const data = await igRequest<{
    data?: Array<{ instagram_business_account?: { id: string; username?: string } }>
  }>(
    '/me/accounts?fields=instagram_business_account{id,username}',
    accessToken,
  )
  const igAccount = (data.data ?? []).find(p => p.instagram_business_account?.id)
  if (!igAccount?.instagram_business_account?.id) {
    throw new Error('連携済みの Instagram ビジネスアカウントが見つかりません')
  }
  return igAccount.instagram_business_account.id
}
