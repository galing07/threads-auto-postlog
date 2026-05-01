'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PenLine, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import type { Post } from '@/types/database'

interface Stats {
  draft: number
  scheduled: number
  posted: number
  failed: number
}

export default function DashboardPage() {
  const [recentPosts, setRecentPosts] = useState<Post[]>([])
  const [stats, setStats] = useState<Stats>({ draft: 0, scheduled: 0, posted: 0, failed: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/posts')
      .then(r => r.json())
      .then((posts: Post[]) => {
        setRecentPosts(posts.slice(0, 5))
        setStats({
          draft: posts.filter(p => p.status === 'draft').length,
          scheduled: posts.filter(p => p.status === 'scheduled').length,
          posted: posts.filter(p => p.status === 'posted').length,
          failed: posts.filter(p => p.status === 'failed').length,
        })
      })
      .finally(() => setLoading(false))
  }, [])

  const statusConfig = {
    draft: { label: '下書き', color: 'text-gray-600 bg-gray-100', icon: PenLine },
    scheduled: { label: '予約済み', color: 'text-blue-600 bg-blue-50', icon: Clock },
    posted: { label: '投稿済み', color: 'text-green-600 bg-green-50', icon: CheckCircle },
    failed: { label: 'エラー', color: 'text-red-600 bg-red-50', icon: AlertCircle },
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">ダッシュボード</h2>
        <p className="text-gray-500 mt-1">Threads自動投稿の管理</p>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {(Object.keys(statusConfig) as Array<keyof Stats>).map(key => {
          const { label, color, icon: Icon } = statusConfig[key]
          return (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className={`inline-flex items-center gap-2 text-sm font-medium px-2.5 py-1 rounded-full ${color}`}>
                <Icon size={14} />
                {label}
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-3">{stats[key]}</p>
            </div>
          )
        })}
      </div>

      {/* クイックアクション */}
      <div className="mb-8">
        <Link
          href="/dashboard/generate"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <PenLine size={18} />
          新しい投稿を生成する
        </Link>
      </div>

      {/* 直近の投稿 */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">直近の投稿</h3>
        </div>
        {loading ? (
          <div className="p-6 text-center text-gray-400 text-sm">読み込み中...</div>
        ) : recentPosts.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            投稿がありません。「投稿を生成する」から始めましょう。
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentPosts.map(post => {
              const { label, color } = statusConfig[post.status]
              return (
                <li key={post.id} className="px-6 py-4 flex items-start justify-between gap-4">
                  <p className="text-sm text-gray-700 line-clamp-2 flex-1">
                    {post.text_content ?? '(テキストなし)'}
                  </p>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
                    {label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
