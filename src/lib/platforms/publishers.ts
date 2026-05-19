// Platform Publisher Strategy
// 各プラットフォームは validate + publish を提供。ルートは publishPost ヘルパー経由で呼ぶ。
// 投稿時に access_token が期限切れだった場合の自動 refresh は publishPost 側で吸収する。

import 'server-only'
import type { Account, Platform, Post } from '@/types/database'
import { createAdminClient } from '@/lib/supabase-admin'
import { createThreadsPost, refreshThreadsToken, ThreadsAuthError } from './threads'
import { createInstagramPost, InstagramAuthError } from './instagram'
import { createXTweet, createXThread, uploadXMedia, XAuthError, type XCredentials } from './x'

export interface PublishContext {
  post: Pick<Post, 'id' | 'text_content' | 'image_url'>
  account: Account
}

export interface PublishResult {
  platformPostId: string
  platformPostIds?: string[]
}

export interface Publisher {
  platform: Platform
  validate(ctx: PublishContext): void
  publish(ctx: PublishContext): Promise<PublishResult>
}

// ---------- Threads ----------
const threadsPublisher: Publisher = {
  platform: 'threads',
  validate({ account }) {
    if (!account.access_token || !account.threads_user_id) {
      throw new Error('Threads APIトークンが設定されていません')
    }
  },
  async publish({ post, account }) {
    const result = await createThreadsPost(
      { accessToken: account.access_token!, userId: account.threads_user_id! },
      { text: post.text_content ?? '', imageUrl: post.image_url ?? undefined },
    )
    return { platformPostId: result.id }
  },
}

// ---------- Instagram ----------
const instagramPublisher: Publisher = {
  platform: 'instagram',
  validate({ post, account }) {
    if (!account.access_token || !account.instagram_user_id) {
      throw new Error('Instagram APIトークンまたはアカウントIDが設定されていません')
    }
    if (!post.image_url) {
      throw new Error('Instagram投稿には画像が必須です')
    }
  },
  async publish({ post, account }) {
    const result = await createInstagramPost(
      { accessToken: account.access_token!, igUserId: account.instagram_user_id! },
      { caption: post.text_content ?? '', imageUrl: post.image_url! },
    )
    return { platformPostId: result.id }
  },
}

// ---------- X ----------
// 本文中に "\n---\n" 区切りが含まれていればスレッド投稿として送信。
function xCredentials(account: Account): XCredentials {
  return {
    apiKey: account.x_api_key!,
    apiSecret: account.x_api_secret!,
    accessToken: account.access_token!,
    accessSecret: account.x_access_secret!,
  }
}

const MAX_X_IMAGE_BYTES = 5 * 1024 * 1024 // X の画像上限相当

/**
 * 画像 URL をサーバー側 fetch する前の SSRF 縮小ガード。
 * image_url はユーザーが posts API 経由で任意設定できるため、
 * https のみ・ループバック/プライベート/メタデータ宛先を拒否する。
 * （DNS リバインディングまでは防げないため、呼び出し側で redirect:'manual'
 *  とサイズ上限も併用する）
 */
function assertFetchableImageUrl(raw: string): void {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('添付画像のURLが不正です')
  }
  if (u.protocol !== 'https:') {
    throw new Error('添付画像のURLは https:// である必要があります')
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host === '::1' ||
    host === '169.254.169.254' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^(::ffff:)?0\.0\.0\.0$/.test(host) ||
    /^f[cd][0-9a-f]{2}:/.test(host) // fc00::/7 ユニークローカル
  ) {
    throw new Error('添付画像のURLのホストが許可されていません')
  }
}

const xPublisher: Publisher = {
  platform: 'x',
  validate({ account }) {
    if (!account.x_api_key || !account.x_api_secret || !account.access_token || !account.x_access_secret) {
      throw new Error('X の4キー（API Key/Secret・Access Token/Secret）が設定されていません')
    }
  },
  async publish({ post, account }) {
    const cred = xCredentials(account)
    const text = post.text_content ?? ''

    // 画像があれば X にアップロードして media_id を取得（スレッド時は先頭ツイートに添付）
    let mediaIds: string[] | undefined
    if (post.image_url) {
      assertFetchableImageUrl(post.image_url)
      // redirect:'manual' でリダイレクト経由の SSRF 迂回を遮断
      const imgRes = await fetch(post.image_url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      })
      if (!imgRes.ok) throw new Error('添付画像の取得に失敗しました')
      const declaredLen = Number(imgRes.headers.get('content-length') ?? 0)
      if (declaredLen > MAX_X_IMAGE_BYTES) {
        throw new Error('添付画像が大きすぎます（5MB以下にしてください）')
      }
      const arrayBuf = await imgRes.arrayBuffer()
      if (arrayBuf.byteLength > MAX_X_IMAGE_BYTES) {
        throw new Error('添付画像が大きすぎます（5MB以下にしてください）')
      }
      const bytes = new Uint8Array(arrayBuf)
      const mime = imgRes.headers.get('content-type') ?? 'image/png'
      mediaIds = [await uploadXMedia(cred, bytes, mime)]
    }

    const parts = text.split(/\n---\n/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) {
      const results = await createXThread(cred, parts, mediaIds)
      return {
        platformPostId: results[0].id,
        platformPostIds: results.map(r => r.id),
      }
    }
    const result = await createXTweet(cred, text, undefined, mediaIds)
    return { platformPostId: result.id }
  },
}

export const publishers: Record<Platform, Publisher> = {
  threads: threadsPublisher,
  instagram: instagramPublisher,
  x: xPublisher,
}

// ---------- Token refresh ----------
// auth error 時に DB の access_token を更新し、true なら再試行する。
async function tryRefreshToken(account: Account): Promise<boolean> {
  const admin = createAdminClient()

  if (account.platform === 'threads') {
    if (!account.access_token) return false
    try {
      const refreshed = await refreshThreadsToken(account.access_token)
      account.access_token = refreshed.accessToken
      account.token_expires_at = new Date(refreshed.expiresAt).toISOString()
      await admin
        .from('accounts')
        .update({
          access_token: refreshed.accessToken,
          token_expires_at: new Date(refreshed.expiresAt).toISOString(),
        })
        .eq('id', account.id)
      return true
    } catch (e) {
      console.error('[publishers] Threads refresh failed', e instanceof Error ? e.message : 'unknown')
      return false
    }
  }

  // X は手動入力トークン運用なので refresh は実施しない（期限切れ時は再連携してもらう）
  // Instagram も long-lived token の refresh は頻度が低く未対応
  return false
}

function isAuthError(e: unknown): boolean {
  return (
    e instanceof ThreadsAuthError ||
    e instanceof XAuthError ||
    e instanceof InstagramAuthError
  )
}

/**
 * validate + publish を行う。auth error なら 1 回だけ refresh を試みて再投稿する。
 */
export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const publisher = publishers[ctx.account.platform]
  if (!publisher) {
    throw new Error(`${ctx.account.platform} の投稿は未対応です`)
  }
  publisher.validate(ctx)

  try {
    return await publisher.publish(ctx)
  } catch (e) {
    if (!isAuthError(e)) throw e

    const refreshed = await tryRefreshToken(ctx.account)
    if (!refreshed) {
      throw new Error('アクセストークンの有効期限が切れています。再連携が必要です')
    }
    // 更新後の credentials で 1 回だけ再試行
    return publisher.publish(ctx)
  }
}
