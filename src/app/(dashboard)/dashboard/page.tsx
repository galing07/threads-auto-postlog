'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PenLine, CheckCircle, Clock, AlertCircle, FileText, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Post } from '@/types/database'

interface Stats {
  draft: number
  scheduled: number
  posted: number
  failed: number
}

const statCards = [
  { key: 'draft' as const,     label: '下書き',   color: 'text-slate-700',  icon: PenLine },
  { key: 'scheduled' as const, label: '予約済み',  color: 'text-[#006F83]',  icon: Clock },
  { key: 'posted' as const,    label: '投稿済み',  color: 'text-green-700',  icon: CheckCircle },
  { key: 'failed' as const,    label: 'エラー',    color: 'text-red-600',    icon: AlertCircle },
]

const statusBadge: Record<string, { label: string; cls: string }> = {
  draft:     { label: '下書き',   cls: 'bg-gray-100 text-gray-600' },
  scheduled: { label: '予約済み', cls: 'bg-[#E9F7F9] text-[#006F83]' },
  posted:    { label: '投稿済み', cls: 'bg-green-50 text-green-700' },
  failed:    { label: 'エラー',   cls: 'bg-red-50 text-red-600' },
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
          draft:     posts.filter(p => p.status === 'draft').length,
          scheduled: posts.filter(p => p.status === 'scheduled').length,
          posted:    posts.filter(p => p.status === 'posted').length,
          failed:    posts.filter(p => p.status === 'failed').length,
        })
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
          ダッシュボード
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">Threads自動投稿の管理センター</p>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map(({ key, label, color, icon: Icon }) => (
          <div
            key={key}
            className="rounded-lg bg-white p-4"
            style={{
              border: '1px solid #e5edf5',
              boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
            }}
          >
            <p className="mb-1 text-xs text-gray-500">{label}</p>
            <p className={`text-3xl font-bold tabular-nums ${color}`}>
              {stats[key]}
            </p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Button asChild className="mb-8">
        <Link href="/dashboard/generate" className="flex items-center gap-2">
          <PenLine className="h-4 w-4" />
          新しい投稿を生成する
          <ArrowRight className="h-3.5 w-3.5 opacity-70" />
        </Link>
      </Button>

      {/* Recent posts */}
      <div
        className="overflow-hidden rounded-lg bg-white"
        style={{
          border: '1px solid #e5edf5',
          boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
        }}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold" style={{ color: '#061b31' }}>直近の投稿</h2>
          <Link
            href="/dashboard/schedule"
            className="flex items-center gap-1 text-xs font-medium text-[#006F83] hover:underline"
          >
            すべて見る <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#00A3BF]" />
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
              <FileText className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">まだ投稿がありません</p>
            <p className="mt-0.5 text-xs text-gray-400">「投稿生成」から始めましょう</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recentPosts.map(post => {
              const b = statusBadge[post.status] ?? { label: post.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <li key={post.id} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  <p className="flex-1 truncate text-sm text-gray-700">
                    {post.text_content ?? '(テキストなし)'}
                  </p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${b.cls}`}>
                    {b.label}
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
