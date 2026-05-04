'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Send, Trash2, Clock, User, ImageIcon, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cx } from '@/lib/utils'
import type { Post } from '@/types/database'

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft:     { label: '下書き',   className: 'bg-gray-100 text-gray-600' },
  scheduled: { label: '予約済み', className: 'bg-blue-50 text-blue-700' },
  posted:    { label: '投稿済み', className: 'bg-green-50 text-green-700' },
  failed:    { label: '失敗',     className: 'bg-red-50 text-red-600' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function DraftsPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'draft' | 'scheduled' | 'posted'>('all')

  async function load() {
    setLoading(true)
    const res = await fetch('/api/posts')
    const data = await res.json() as Post[]
    setPosts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handlePublish(postId: string) {
    setPublishing(postId)
    try {
      await fetch(`/api/posts/${postId}/publish`, { method: 'POST' })
      await load()
    } finally {
      setPublishing(null)
    }
  }

  async function handleDelete(postId: string) {
    if (!confirm('この投稿を削除しますか？')) return
    setDeleting(postId)
    try {
      await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      setPosts(prev => prev.filter(p => p.id !== postId))
    } finally {
      setDeleting(null)
    }
  }

  const filtered = filter === 'all' ? posts : posts.filter(p => p.status === filter)

  const counts = {
    all:       posts.length,
    draft:     posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    posted:    posts.filter(p => p.status === 'posted').length,
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
            下書き一覧
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">生成した投稿の管理・確認・投稿</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
          更新
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
        {(['all', 'draft', 'scheduled', 'posted'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              filter === f
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {f === 'all' ? 'すべて' : STATUS_LABEL[f].label}
            <span className={cx(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]',
              filter === f ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500',
            )}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00A3BF] border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
            <FileText className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {filter === 'all' ? '投稿がありません' : `${STATUS_LABEL[filter].label}の投稿がありません`}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">「投稿生成」から作成してください</p>
          <Button onClick={() => router.push('/dashboard/generate')} className="mt-4">
            投稿を生成する
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(post => (
            <Card key={post.id} className="p-4">
              <div className="flex items-start gap-3">
                {/* 画像サムネイル */}
                <div className="shrink-0">
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt=""
                      className="h-16 w-16 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-md bg-gray-100">
                      <ImageIcon className="h-5 w-5 text-gray-300" />
                    </div>
                  )}
                </div>

                {/* 本文 */}
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={cx(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      STATUS_LABEL[post.status]?.className ?? 'bg-gray-100 text-gray-600',
                    )}>
                      {STATUS_LABEL[post.status]?.label ?? post.status}
                    </span>
                    {post.theme && (
                      <span className="truncate text-xs text-gray-400">{post.theme}</span>
                    )}
                  </div>
                  <p className="line-clamp-3 text-sm text-gray-700 whitespace-pre-line">
                    {post.text_content}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-400">
                    {post.account_id && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        アカウントあり
                      </span>
                    )}
                    {post.scheduled_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(post.scheduled_at)}
                      </span>
                    )}
                    <span className="ml-auto">{formatDate(post.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {(post.status === 'draft' || post.status === 'failed') && post.account_id && (
                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                  <Button
                    onClick={() => handlePublish(post.id)}
                    disabled={publishing === post.id}
                    isLoading={publishing === post.id}
                    loadingText="投稿中..."
                    className="flex-1 gap-1.5 py-1.5 text-xs"
                  >
                    <Send className="h-3.5 w-3.5" />
                    今すぐ投稿
                  </Button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    disabled={deleting === post.id}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    削除
                  </button>
                </div>
              )}
              {(post.status === 'draft') && !post.account_id && (
                <div className="mt-3 flex justify-end border-t border-gray-100 pt-3">
                  <button
                    onClick={() => handleDelete(post.id)}
                    disabled={deleting === post.id}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    削除
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
