'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PenLine, CheckCircle, Clock, AlertCircle, FileText, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { cx } from '@/lib/utils'
import type { Post } from '@/types/database'

interface Stats {
  draft: number
  scheduled: number
  posted: number
  failed: number
}

const statCards = [
  { key: 'draft' as const, label: '下書き', icon: PenLine, iconCls: 'text-gray-500', bgCls: 'bg-gray-100' },
  { key: 'scheduled' as const, label: '予約済み', icon: Clock, iconCls: 'text-blue-600', bgCls: 'bg-blue-50' },
  { key: 'posted' as const, label: '投稿済み', icon: CheckCircle, iconCls: 'text-emerald-600', bgCls: 'bg-emerald-50' },
  { key: 'failed' as const, label: 'エラー', icon: AlertCircle, iconCls: 'text-red-500', bgCls: 'bg-red-50' },
]

const statusBadge: Record<string, { label: string; variant: 'neutral' | 'default' | 'success' | 'error' | 'warning' }> = {
  draft: { label: '下書き', variant: 'neutral' },
  scheduled: { label: '予約済み', variant: 'default' },
  posted: { label: '投稿済み', variant: 'success' },
  failed: { label: 'エラー', variant: 'error' },
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

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-gray-500">Threads自動投稿の管理センター</p>
      </div>

      {/* KPI cards — Tremor style */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        {statCards.map(({ key, label, icon: Icon, iconCls, bgCls }) => (
          <Card key={key} className="p-5">
            <div className={cx('mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md', bgCls)}>
              <Icon className={cx('h-5 w-5', iconCls)} />
            </div>
            <p className="text-3xl font-bold tabular-nums text-gray-900">{stats[key]}</p>
            <p className="mt-1 text-sm text-gray-500">{label}</p>
          </Card>
        ))}
      </div>

      {/* CTA */}
      <Button asChild className="mb-8">
        <Link href="/dashboard/generate" className="flex items-center gap-2">
          <PenLine className="h-4 w-4" />
          新しい投稿を生成する
          <ArrowRight className="h-3.5 w-3.5 opacity-60" />
        </Link>
      </Button>

      {/* Recent posts table */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-gray-900">直近の投稿</h2>
          <Link
            href="/dashboard/schedule"
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            すべて見る <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
          </div>
        ) : recentPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
              <FileText className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">まだ投稿がありません</p>
            <p className="mt-1 text-xs text-gray-400">「投稿生成」から始めましょう</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recentPosts.map(post => {
              const b = statusBadge[post.status] ?? { label: post.status, variant: 'neutral' as const }
              return (
                <li key={post.id} className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-gray-50">
                  <p className="flex-1 truncate text-sm text-gray-700">
                    {post.text_content ?? '(テキストなし)'}
                  </p>
                  <Badge variant={b.variant}>{b.label}</Badge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
