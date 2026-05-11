// Platform Publisher Strategy
// 各プラットフォームは validate + publish を提供。ルートは registry 経由で呼ぶ。

import type { Account, Platform, Post } from '@/types/database'
import { createThreadsPost } from './threads'
import { createInstagramPost } from './instagram'
import { createXTweet, createXThread } from './x'

export interface PublishContext {
  post: Pick<Post, 'id' | 'text_content' | 'image_url'>
  account: Account
}

export interface PublishResult {
  platformPostId: string
}

export interface Publisher {
  platform: Platform
  /** publish 前の検証。失敗時はユーザー向けメッセージ付きで throw */
  validate(ctx: PublishContext): void
  publish(ctx: PublishContext): Promise<PublishResult>
}

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
      return { platformPostId: results[0].id }
    }
    const result = await createXTweet(account.access_token!, text)
    return { platformPostId: result.id }
  },
}

const xThreadPublisher: Publisher = {
  ...xPublisher,
  platform: 'x_thread',
}

export const publishers: Record<Platform, Publisher> = {
  threads: threadsPublisher,
  instagram: instagramPublisher,
  x: xPublisher,
  x_thread: xThreadPublisher,
}

/** validate + publish をまとめて行うヘルパー */
export async function publishPost(ctx: PublishContext): Promise<PublishResult> {
  const publisher = publishers[ctx.account.platform]
  if (!publisher) {
    throw new Error(`${ctx.account.platform} の投稿は未対応です`)
  }
  publisher.validate(ctx)
  return publisher.publish(ctx)
}
