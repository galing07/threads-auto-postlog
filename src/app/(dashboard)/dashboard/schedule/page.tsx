'use client'

import { useEffect, useState } from 'react'
import { Clock, CheckCircle, AlertCircle } from 'lucide-react'
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
    <div className="p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">スケジュール</h2>
        <p className="text-gray-500 mt-1">予約済み投稿の一覧（15分毎に自動実行）</p>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 text-sm py-12">読み込み中...</div>
      ) : scheduled.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <Clock size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">予約済みの投稿はありません</p>
          <p className="text-gray-400 text-xs mt-1">「投稿生成」で日時を設定して予約できます</p>
        </div>
      ) : (
        <div className="space-y-3">
          {scheduled
            .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())
            .map(post => {
              const scheduledDate = new Date(post.scheduled_at!)
              const isPast = scheduledDate < now
              return (
                <div key={post.id} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {isPast ? (
                          <AlertCircle size={16} className="text-orange-500" />
                        ) : (
                          <Clock size={16} className="text-blue-500" />
                        )}
                        <span className={`text-sm font-medium ${isPast ? 'text-orange-600' : 'text-blue-600'}`}>
                          {scheduledDate.toLocaleString('ja-JP')}
                          {isPast && ' （処理待ち）'}
                        </span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          {post.account?.name ?? '-'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-3">{post.text_content}</p>
                      {post.image_url && (
                        <div className="mt-2">
                          <img src={post.image_url} alt="" className="w-20 h-20 object-cover rounded-lg" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleCancel(post.id)}
                      className="shrink-0 text-xs text-red-500 hover:text-red-600 border border-red-200 px-3 py-1.5 rounded-lg"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 text-xs text-gray-400">
        <CheckCircle size={12} />
        <span>予約投稿は15分毎に自動実行されます（Vercel Cron）</span>
      </div>
    </div>
  )
}
