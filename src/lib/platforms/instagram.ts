// Instagram API adapter（Instagram ログイン方式 / Business Login for Instagram）
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
//
// 旧「Facebook ログイン方式」(graph.facebook.com + ページトークン + /me/accounts) から
// 新「Instagram ログイン方式」(graph.instagram.com + IGユーザートークン) へ移行。
// Facebookページ不要・ページ管理者不要・Graph API Explorer不要。
// トークンはすべて Authorization: Bearer ヘッダーで送信（URL query への露出を避ける）。
const IG_API_BASE = 'https://graph.instagram.com/v23.0'
const REQUEST_TIMEOUT_MS = 30_000

// ---- Business Login for Instagram (OAuth) ----
// 認可エンドポイントは www.instagram.com（新「Instagram ログイン方式 / Business Login」用）。
// instagram_business_* スコープはこの www 側でのみ有効で、api.instagram.com/oauth/authorize
// に business スコープを投げると "Invalid platform app" になる（api 側は旧 Basic Display 用）。
// 一方トークン交換 (access_token) は api.instagram.com 側が正。authorize と token でホストが違う点に注意。
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/
export const INSTAGRAM_OAUTH_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize'
const INSTAGRAM_OAUTH_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const INSTAGRAM_LONGLIVED_URL = 'https://graph.instagram.com/access_token'
/** 投稿に必要な最小スコープ（基本情報＋コンテンツ公開） */
export const INSTAGRAM_OAUTH_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
]

/**
 * Business Login for Instagram の認可 URL を組み立てる（単一情報源）。
 *
 * 実フロー (route.ts) と診断 (debug/route.ts) で必ず同じ URL を生成するために共通化する。
 * enable_fb_login=0 は Facebook ログイン経路を無効化し純粋な Instagram ログインを強制する
 * 重要パラメータで、ここに含めないと「診断で見える URL」と「実際に送る URL」がズレる。
 */
export function buildInstagramAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const query = new URLSearchParams({
    enable_fb_login: '0',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: INSTAGRAM_OAUTH_SCOPES.join(','),
    state: params.state,
  })
  return `${INSTAGRAM_OAUTH_AUTHORIZE_URL}?${query.toString()}`
}

/** Instagram キャプション上限 (Reels / Feed 共通) — 単一情報源 */
export const INSTAGRAM_CAPTION_MAX = 2200

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

export interface InstagramReelPostResult {
  /** media_publish 後の最終的な公開メディア ID */
  mediaId: string
  /** /media で作成した中間コンテナ ID（poll/publish のリトライ・回収用に永続化推奨） */
  containerId: string
}

export interface InstagramTokenRefreshResult {
  accessToken: string
  /** epoch ミリ秒 */
  expiresAt: number
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
    // Graph API のエラー本文から、機密を含まない説明文だけを抽出してログ＋例外に載せる。
    // 形式: { error: { message, type, code, error_subcode, error_user_msg } }
    // トークン等の機密は元々ボディに含まれない（path/status と error.message のみ扱う）。
    const raw = await res.text().catch(() => '')
    let detail = ''
    try {
      const j = JSON.parse(raw) as {
        error?: { message?: string; error_user_msg?: string; code?: number; error_subcode?: number }
      }
      detail = (j.error?.error_user_msg || j.error?.message || '').toString().slice(0, 250)
    } catch {
      // JSON でない場合は先頭のみ
      detail = raw.replace(/\s+/g, ' ').slice(0, 200)
    }
    console.error('[Instagram API]', method, path, res.status, detail)
    if (res.status === 401 || res.status === 403) {
      throw new InstagramAuthError(detail ? `Instagram 認証/権限エラー: ${detail}` : undefined)
    }
    throw new Error(`Instagram API error (HTTP ${res.status})${detail ? `: ${detail}` : ''}`)
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
  // 注: https-only & SSRF 縮小は publisher 層 (publishers.ts:assertFetchableHttpsUrl) で
  // 行う。低レベル API では非 null チェックのみ（多重 validation を避けて単一情報源化）。

  const container = await igRequest<{ id: string }>(
    `/${encodeURIComponent(igUserId)}/media`,
    accessToken,
    { method: 'POST', body: { image_url: imageUrl, caption } },
  )

  // 画像コンテナは作成直後は公開可能になっていない（IG が image_url を取得・処理する）。
  // FINISHED を待たずに media_publish すると HTTP 400
  // 「The media is not ready for publishing, please wait for a moment」になるため、
  // status_code=FINISHED までポーリングしてから公開する（小さい画像は即 FINISHED、
  // 実画像は数秒かかる）。
  await waitForContainerReady(container.id, accessToken, {
    timeoutMs: IMAGE_CONTAINER_TIMEOUT_MS,
    intervalMs: IMAGE_CONTAINER_INTERVAL_MS,
    label: '画像',
  })

  const published = await igRequest<{ id: string }>(
    `/${encodeURIComponent(igUserId)}/media_publish`,
    accessToken,
    { method: 'POST', body: { creation_id: container.id } },
  )

  return { id: published.id }
}

/**
 * Instagram Business Account に Reels (短尺縦動画) を投稿
 *
 * 3-step:
 *   1. media_type=REELS で video_url を渡してコンテナ作成
 *   2. Graph API が公開可能になるまで status_code をポーリング (FINISHED で OK)
 *   3. media_publish でフィードに公開
 *
 * - Graph API は video_url を自分でフェッチするため公開アクセス可能な https URL が必要
 *   (Supabase Storage の signed URL でも有効期限内なら可)
 * - share_to_feed は publisher 層でデフォルト解決済み。ここでは明示必須。
 *
 * 戻り値は `{ mediaId, containerId }` の双方を返す。containerId は呼び出し元が
 * poll 失敗 / Vercel タイムアウト時のリカバリ用に永続化することを想定する。
 *
 * @param onContainerCreated コンテナ作成直後（poll 開始前）に呼ばれるコールバック。
 *   呼び出し元はここで containerId を DB に永続化することで、処理が途中で
 *   死んでも漏れた中間リソースを追跡可能にする。失敗しても poll/publish は続行する。
 */
export async function createInstagramReelPost(
  credentials: InstagramCredentials,
  options: {
    caption: string
    videoUrl: string
    /** メインフィードへの露出可否。publisher 層で必ず明示指定する（デフォルト無し） */
    shareToFeed: boolean
    onContainerCreated?: (containerId: string) => Promise<void> | void
  },
): Promise<InstagramReelPostResult> {
  const { accessToken, igUserId } = credentials
  const { caption, videoUrl, shareToFeed, onContainerCreated } = options

  if (!videoUrl) {
    throw new Error('Instagram Reels は動画 URL が必須です')
  }
  // 注: https-only & SSRF 縮小は publisher 層 (publishers.ts:assertFetchableVideoUrl) で
  // 行う。低レベル API では非 null チェックのみ（多重 validation を避けて単一情報源化）。

  const container = await igRequest<{ id: string }>(
    `/${encodeURIComponent(igUserId)}/media`,
    accessToken,
    {
      method: 'POST',
      body: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        share_to_feed: shareToFeed ? 'true' : 'false',
      },
    },
  )

  // コンテナ作成直後に即永続化。poll/publish が落ちても containerId は失われない。
  if (onContainerCreated) {
    try {
      await onContainerCreated(container.id)
    } catch (e) {
      // 永続化失敗は致命ではない（投稿自体は継続）。ID も漏らさず status のみ。
      console.error('[Instagram API] onContainerCreated callback failed', e instanceof Error ? e.name : 'unknown')
    }
  }

  // 公開可能状態まで待つ (Reels は処理に時間がかかる)
  await waitForContainerReady(container.id, accessToken, {
    timeoutMs: REELS_POLL_TIMEOUT_MS,
    intervalMs: REELS_POLL_INTERVAL_MS,
    label: 'Reels',
  })

  const published = await igRequest<{ id: string }>(
    `/${encodeURIComponent(igUserId)}/media_publish`,
    accessToken,
    { method: 'POST', body: { creation_id: container.id } },
  )

  return { mediaId: published.id, containerId: container.id }
}

const REELS_POLL_INTERVAL_MS = 5_000
const REELS_POLL_TIMEOUT_MS = 5 * 60_000 // 5 分以内に FINISHED にならなければ諦める
// 画像コンテナは動画より遥かに速く処理される。短い間隔・短いタイムアウトで待つ
// （ルートの maxDuration に収まる範囲。実画像は通常数秒で FINISHED）。
const IMAGE_CONTAINER_INTERVAL_MS = 2_000
const IMAGE_CONTAINER_TIMEOUT_MS = 50_000

/**
 * メディアコンテナ (画像 / Reels) が公開可能 (status_code=FINISHED) になるまで待つ。
 * 待たずに media_publish すると HTTP 400「The media is not ready for publishing」になる。
 *
 * TODO(webhook-migration): この同期ポーリングはサーバ実行時間と費用の両面で重い。
 * 本来は Instagram Graph API の Webhooks (media field の status_code 通知) を購読し、
 * コンテナ作成時に containerId を永続化 → webhook 受信時に media_publish を発火する
 * 非同期フローに置き換えるべき。中間 containerId は createInstagramReelPost の
 * onContainerCreated で既に永続化可能なので、移行時はこのポーリングを撤去し webhook
 * ハンドラ (POST /api/webhooks/instagram) を新設するだけで済む。
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  opts: { timeoutMs: number; intervalMs: number; label: string },
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < opts.timeoutMs) {
    const data = await igRequest<{ status_code?: string; status?: string }>(
      `/${encodeURIComponent(containerId)}?fields=status_code,status`,
      accessToken,
    )
    const code = data.status_code ?? data.status ?? ''
    if (code === 'FINISHED') return
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram ${opts.label} コンテナの処理に失敗しました (status=${code})`)
    }
    await new Promise((resolve) => setTimeout(resolve, opts.intervalMs))
  }
  throw new Error(`Instagram ${opts.label} コンテナの処理が制限時間内に完了しませんでした`)
}

/**
 * Instagram long-lived access token のリフレッシュ。
 * - long-lived token は 60 日有効。期限直前に rotate して新 token を取得する。
 * - 入力 token も同じく long-lived である必要がある（short-lived は別エンドポイント）。
 * Docs: https://developers.facebook.com/docs/instagram-platform/refresh-access-tokens
 */
export async function refreshInstagramAccessToken(
  currentAccessToken: string,
): Promise<InstagramTokenRefreshResult> {
  const res = await igRequest<{ access_token: string; expires_in: number; token_type?: string }>(
    '/refresh_access_token?grant_type=ig_refresh_token',
    currentAccessToken,
  )
  if (!res.access_token) {
    throw new InstagramAuthError('Instagram token refresh response did not include access_token')
  }
  return {
    accessToken: res.access_token,
    expiresAt: Date.now() + (res.expires_in ?? 60 * 24 * 60 * 60) * 1000,
  }
}

/**
 * Instagram ユーザートークンから IG ユーザー（プロアカウント）情報を取得。
 * 新方式ではページ走査は不要で /me から直接取得できる。
 */
export async function getInstagramAccountInfo(
  accessToken: string,
): Promise<{ id: string; username?: string }> {
  const data = await igRequest<{ user_id?: string; id?: string; username?: string }>(
    '/me?fields=user_id,username',
    accessToken,
  )
  const id = data.user_id ?? data.id
  if (!id) {
    throw new InstagramAuthError('Instagram ユーザー情報の取得に失敗しました')
  }
  return { id, username: data.username }
}

/**
 * トークンから接続済みの Instagram ユーザー ID を取得（後方互換のヘルパー）。
 */
export async function fetchInstagramUserId(accessToken: string): Promise<string> {
  const { id } = await getInstagramAccountInfo(accessToken)
  return id
}

export interface InstagramOAuthResult {
  /** 長期（60日）アクセストークン */
  accessToken: string
  /** IG ユーザー（プロアカウント）ID */
  igUserId: string
  username?: string
  /** epoch ミリ秒 */
  expiresAt: number
}

/**
 * 認可コードを長期アクセストークン＋IGユーザーIDに交換する。
 *   1. code → 短期トークン (POST api.instagram.com/oauth/access_token)
 *   2. 短期 → 長期(60日) (GET graph.instagram.com/access_token?grant_type=ig_exchange_token)
 *   3. /me で username 取得
 */
export async function exchangeInstagramCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<InstagramOAuthResult> {
  // 1. 短期トークン
  const shortRes = await fetch(INSTAGRAM_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!shortRes.ok) {
    console.error('[Instagram OAuth] short-lived exchange failed', shortRes.status)
    throw new InstagramAuthError('Instagram 認可コードの交換に失敗しました')
  }
  const shortData = (await shortRes.json()) as { access_token?: string; user_id?: string | number }
  if (!shortData.access_token) {
    throw new InstagramAuthError('Instagram 短期トークンの取得に失敗しました')
  }

  // 2. 長期トークン（60日）
  const longParams = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: clientSecret,
    access_token: shortData.access_token,
  })
  const longRes = await fetch(`${INSTAGRAM_LONGLIVED_URL}?${longParams.toString()}`, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!longRes.ok) {
    console.error('[Instagram OAuth] long-lived exchange failed', longRes.status)
    throw new InstagramAuthError('Instagram 長期トークンの取得に失敗しました')
  }
  const longData = (await longRes.json()) as { access_token?: string; expires_in?: number }
  const accessToken = longData.access_token ?? shortData.access_token
  const expiresAt = Date.now() + (longData.expires_in ?? 60 * 24 * 60 * 60) * 1000

  // 3. IGユーザーID / username
  const info = await getInstagramAccountInfo(accessToken)

  return { accessToken, igUserId: info.id, username: info.username, expiresAt }
}
