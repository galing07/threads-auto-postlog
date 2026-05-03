'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, AlertCircle, PenLine, Send, FileText } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { PostWithAccount } from '@/types/database'

const STATUS_CONFIG = {
  draft: { label: '下書き', variant: 'neutral' as const, Icon: PenLine },
  scheduled: { label: '予約済み', variant: 'default' as const, Icon: Clock },
  posted: { label: '投稿済み', variant: 'success' as const, Icon: CheckCircle },
  failed: { label: 'エラー', variant: 'error' as const, Icon: AlertCircle },
}

export default function LogsPage() {
  const [posts, setPosts] = useState<PostWithAccount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/posts')
      .then(r => r.json())
      .then(setPosts)
      .finally(() => setLoading(false))
  }, [])

  async function handlePublish(postId: string) {
    if (!confirm('今すぐThreadsに投稿しますか？')) return
    const res = await fetch(`/api/posts/${postId}/publish`, { method: 'POST' })
    if (res.ok) {
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'posted' as const } : p))
    } else {
      alert('投稿に失敗しました')
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">投稿ログ</h1>
        <p className="mt-1 text-sm text-gray-500">生成・投稿した全コンテンツの履歴</p>
      </div>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
              <FileText className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">投稿履歴がありません</p>
            <p className="mt-1 text-xs text-gray-400">投稿を生成すると、ここに履歴が表示されます</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  投稿内容
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  アカウント
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  ステータス
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  日時
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map(post => {
                const { label, variant, Icon } = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft
                return (
                  <tr key={post.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="max-w-xs px-5 py-4">
                      <p className="line-clamp-2 text-sm text-gray-700 leading-relaxed">
                        {post.text_content ?? '(テキストなし)'}
                      </p>
                      {post.image_url && (
                        <span className="mt-0.5 block text-xs text-blue-500">画像あり</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-500">{post.account?.name ?? '—'}</span>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={variant}>
                        <Icon className="h-3 w-3" />
                        {label}
                      </Badge>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-gray-400">
                        {post.scheduled_at
                          ? new Date(post.scheduled_at).toLocaleString('ja-JP')
                          : new Date(post.created_at).toLocaleString('ja-JP')}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {post.status === 'draft' && (
                        <button
                          onClick={() => handlePublish(post.id)}
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <Send className="h-3 w-3" />
                          投稿する
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
