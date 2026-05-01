'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, AlertCircle, PenLine, Send } from 'lucide-react'
import type { PostWithAccount } from '@/types/database'

const statusConfig = {
  draft: { label: '下書き', color: 'text-gray-600 bg-gray-100', icon: PenLine },
  scheduled: { label: '予約済み', color: 'text-blue-600 bg-blue-50', icon: Clock },
  posted: { label: '投稿済み', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  failed: { label: 'エラー', color: 'text-red-600 bg-red-50', icon: AlertCircle },
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
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: 'posted' } : p))
    } else {
      alert('投稿に失敗しました')
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">投稿ログ</h2>
        <p className="text-gray-500 mt-1">生成・投稿した全コンテンツの履歴</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">読み込み中...</div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">投稿履歴がありません</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">投稿内容</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">アカウント</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">ステータス</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">日時</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {posts.map(post => {
                const { label, color, icon: Icon } = statusConfig[post.status]
                return (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4 max-w-xs">
                      <p className="line-clamp-2 text-gray-700">{post.text_content ?? '(テキストなし)'}</p>
                      {post.image_url && (
                        <span className="text-xs text-blue-500 mt-0.5 block">画像あり</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-500">{post.account?.name ?? '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color}`}>
                        <Icon size={12} />
                        {label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">
                      {post.scheduled_at
                        ? new Date(post.scheduled_at).toLocaleString('ja-JP')
                        : new Date(post.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-5 py-4">
                      {post.status === 'draft' && (
                        <button
                          onClick={() => handlePublish(post.id)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          <Send size={12} />
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
      </div>
    </div>
  )
}
