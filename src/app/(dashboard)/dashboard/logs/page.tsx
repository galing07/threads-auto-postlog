'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, AlertCircle, PenLine, Send, FileText } from 'lucide-react'
import type { PostWithAccount } from '@/types/database'

const STATUS_CONFIG = {
  draft:     { label: '下書き',   cls: 'bg-gray-100 text-gray-600',          Icon: PenLine },
  scheduled: { label: '予約済み', cls: 'bg-[#E9F7F9] text-[#006F83]',        Icon: Clock },
  posted:    { label: '投稿済み', cls: 'bg-green-50 text-green-700',           Icon: CheckCircle },
  failed:    { label: 'エラー',   cls: 'bg-red-50 text-red-600',              Icon: AlertCircle },
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
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
          投稿ログ
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">生成・投稿した全コンテンツの履歴</p>
      </div>

      <div
        className="overflow-hidden rounded-lg bg-white"
        style={{
          border: '1px solid #e5edf5',
          boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#00A3BF]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
              <FileText className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">投稿履歴がありません</p>
            <p className="mt-0.5 text-xs text-gray-400">投稿を生成すると、ここに履歴が表示されます</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">投稿内容</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">アカウント</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">ステータス</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">日時</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {posts.map(post => {
                  const { label, cls, Icon } = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft
                  return (
                    <tr key={post.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="max-w-xs px-5 py-3">
                        <p className="line-clamp-2 text-gray-700 leading-relaxed">
                          {post.text_content ?? '(テキストなし)'}
                        </p>
                        {post.image_url && (
                          <span className="mt-0.5 block text-xs text-[#006F83]">画像あり</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500">{post.account?.name ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
                          <Icon className="h-3 w-3" />
                          {label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-400 tabular-nums">
                        {post.scheduled_at
                          ? new Date(post.scheduled_at).toLocaleString('ja-JP')
                          : new Date(post.created_at).toLocaleString('ja-JP')}
                      </td>
                      <td className="px-5 py-3">
                        {post.status === 'draft' && (
                          <button
                            onClick={() => handlePublish(post.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-[#006F83] hover:text-[#005A6B] transition-colors"
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
          </div>
        )}
      </div>
    </div>
  )
}
