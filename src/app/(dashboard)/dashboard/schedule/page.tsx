'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertCircle, CheckCircle, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import type { PostWithAccount } from '@/types/database'

export default function SchedulePage() {
  const [scheduled, setScheduled] = useState<PostWithAccount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/posts?status=scheduled')
      .then(r => r.json())
      .then(setScheduled)
      .finally(() => setLoading(false))
  }, [])

  async function handleCancel(postId: string) {
    if (!confirm('予約をキャンセルして下書きに戻しますか？')) return
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft', scheduledAt: null }),
    })
    setScheduled(prev => prev.filter(p => p.id !== postId))
  }

  const now = new Date()

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">スケジュール</h1>
        <p className="mt-1 text-sm text-gray-500">予約済み投稿の一覧（15分毎に自動実行）</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
        </div>
      ) : scheduled.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100">
            <Clock className="h-6 w-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">予約済みの投稿はありません</p>
          <p className="mt-1 text-xs text-gray-400">「投稿生成」で日時を設定して予約できます</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {scheduled
            .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
            .map(post => {
              const scheduledDate = new Date(post.scheduled_at!)
              const isPast = scheduledDate < now
              return (
                <Card key={post.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Meta row */}
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant={isPast ? 'warning' : 'default'}>
                          {isPast ? (
                            <AlertCircle className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {scheduledDate.toLocaleString('ja-JP')}
                          {isPast && '（処理待ち）'}
                        </Badge>
                        {post.account?.name && (
                          <span className="text-xs text-gray-400">{post.account.name}</span>
                        )}
                      </div>
                      {/* Content */}
                      <p className="text-sm text-gray-700 line-clamp-3 leading-relaxed">
                        {post.text_content}
                      </p>
                      {post.image_url && (
                        <img
                          src={post.image_url}
                          alt=""
                          className="mt-3 h-16 w-16 rounded-lg object-cover"
                        />
                      )}
                    </div>
                    {/* Cancel button */}
                    <Button
                      variant="ghost"
                      onClick={() => handleCancel(post.id)}
                      className="shrink-0 h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              )
            })}
        </div>
      )}

      {/* Footer note */}
      <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-400">
        <CheckCircle className="h-3 w-3" />
        <span>予約投稿は15分毎に自動実行されます（Vercel Cron）</span>
      </div>
    </div>
  )
}
