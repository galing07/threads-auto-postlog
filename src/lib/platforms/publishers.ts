// Platform Publisher Strategy
// 各プラットフォームは validate + publish を提供。ルートは publishPost ヘルパー経由で呼ぶ。
// 投稿時に access_token が期限切れだった場合の自動 refresh は publishPost 側で吸収する。

import 'server-only'
import type { Account, Platform, Post } from '@/types/database'
import { createAdminClient } from '@/lib/supabase-admin'
import { createThreadsPost, refreshThreadsToken, ThreadsAuthError } from './threads'
import { createInstagramPost, InstagramAuthError } from './instagram'
import { createXTweet, createXThread, XAuthError } from './x'

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
const xPublisher: Publisher = {
  platform: 'x',
  validate({ account }) {
    if (!account.access_token) {
      throw new Error('X APIトークンが設定されていません')
    }
  },
  async publish({ post, account }) {
    const text = post.text_content ?? ''
    const parts = text.split(/\n---\n/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) {
      const results = await createXThread(account.access_token!, parts)
      return {
        platformPostId: results[0].id,
        platformPostIds: results.map(r => r.id),
      }
    }
    const result = await createXTweet(account.access_token!, text)
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
