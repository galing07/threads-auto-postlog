// Instagram Graph API adapter
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
// Token はすべて Authorization: Bearer ヘッダーで送信（URL query への露出を避ける）

const IG_API_BASE = 'https://graph.facebook.com/v21.0'

interface InstagramCredentials {
  accessToken: string
  igUserId: string // Instagram Business Account ID
}

interface CreatePostOptions {
  caption: string
  imageUrl: string // 必須（Instagramはテキストのみ投稿不可）
}

interface InstagramPostResult {
  id: string
}

async function igRequest<T>(
  path: string,
  accessToken: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, string> } = {},
): Promise<T> {
  const { method = 'GET', body } = options
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  }
  if (method === 'POST' && body) {
    // application/x-www-form-urlencoded で POST（access_token は header）
    init.headers = {
      ...init.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    init.body = new URLSearchParams(body).toString()
  }

  const res = await fetch(`${IG_API_BASE}${path}`, init)
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    console.error('[Instagram API]', method, path, res.status, errText)
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
  // Instagram の Graph API はサーバ側から imageUrl を fetch するため
  // https のみ受け付け、http や file:/data: などは拒否（SSRF誘発の縮小）
  if (!/^https:\/\//i.test(imageUrl)) {
    throw new Error('Instagram の画像URLは https:// で始まる必要があります')
  }

  // Step 1: メディアコンテナ作成
  const container = await igRequest<{ id: string }>(
    `/${igUserId}/media`,
    accessToken,
    { method: 'POST', body: { image_url: imageUrl, caption } },
  )

  // Step 2: 公開
  const published = await igRequest<{ id: string }>(
    `/${igUserId}/media_publish`,
    accessToken,
    { method: 'POST', body: { creation_id: container.id } },
  )

  return { id: published.id }
}

/**
 * Token から接続済みの Instagram Business Account ID を取得
 * /me/accounts → 各 Page の instagram_business_account を抽出
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
