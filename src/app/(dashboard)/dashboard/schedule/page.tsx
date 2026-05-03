'use client'

import { useEffect, useState } from 'react'
import { Clock, AlertCircle, CheckCircle, X } from 'lucide-react'
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
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
          スケジュール
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">予約済み投稿の一覧（15分毎に自動実行）</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#00A3BF]" />
        </div>
      ) : scheduled.length === 0 ? (
        <div
          className="rounded-lg bg-white py-14 text-center"
          style={{
            border: '1px solid #e5edf5',
            boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
          }}
        >
          <Clock className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">予約済みの投稿はありません</p>
          <p className="mt-0.5 text-xs text-gray-400">「投稿生成」で日時を設定して予約できます</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduled
            .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
            .map(post => {
              const scheduledDate = new Date(post.scheduled_at!)
              const isPast = scheduledDate < now
              return (
                <div
                  key={post.id}
                  className="rounded-lg bg-white p-5"
                  style={{
                    border: '1px solid #e5edf5',
                    boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {isPast ? (
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-[#00A3BF]" />
                        )}
                        <span className={`text-sm font-medium ${isPast ? 'text-orange-600' : 'text-[#006F83]'}`}>
                          {scheduledDate.toLocaleString('ja-JP')}
                          {isPast && '（処理待ち）'}
                        </span>
                        {post.account?.name && (
                          <span className="rounded-full bg-[#E9F7F9] px-2 py-0.5 text-xs text-[#006F83]">
                            {post.account.name}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-gray-700 line-clamp-3">
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
                    <button
                      onClick={() => handleCancel(post.id)}
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-400">
        <CheckCircle className="h-3.5 w-3.5" />
        <span>予約投稿は15分毎に自動実行されます（Vercel Cron）</span>
      </div>
    </div>
  )
}
