'use client'

import { useEffect, useState } from 'react'
import { Sparkles, ImageIcon, Send, Save, RefreshCw } from 'lucide-react'
import type { Account, Post } from '@/types/database'

type Step = 'input' | 'preview' | 'done'

export default function GeneratePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [theme, setTheme] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [loading, setLoading] = useState(false)
  const [generatedText, setGeneratedText] = useState('')
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [savedPost, setSavedPost] = useState<Post | null>(null)

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then((data: Account[]) => {
        setAccounts(data)
        if (data.length > 0) setSelectedAccount(data[0].id)
      })
  }, [])

  async function handleGenerate() {
    if (!selectedAccount || !theme.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccount, theme }),
      })
      const data = await res.json() as { content: string; imagePrompt: string }
      setGeneratedText(data.content)
      setImagePrompt(data.imagePrompt)
      setStep('preview')
    } catch {
      alert('生成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateImage() {
    if (!imagePrompt) return
    setImageLoading(true)
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt, style: 'diagram' }),
      })
      const data = await res.json() as { imageUrl: string }
      setImageUrl(data.imageUrl)
    } catch {
      alert('画像生成に失敗しました')
    } finally {
      setImageLoading(false)
    }
  }

  async function handleSave(publish = false) {
    setLoading(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount,
          textContent: generatedText,
          imageUrl: imageUrl || undefined,
          imagePrompt: imagePrompt || undefined,
          theme,
          scheduledAt: scheduledAt || undefined,
        }),
      })
      const post = await res.json() as Post
      setSavedPost(post)

      if (publish) {
        await fetch(`/api/posts/${post.id}/publish`, { method: 'POST' })
      }

      setStep('done')
    } catch {
      alert('保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep('input')
    setTheme('')
    setGeneratedText('')
    setImagePrompt('')
    setImageUrl('')
    setScheduledAt('')
    setSavedPost(null)
  }

  if (step === 'done') {
    return (
      <div className="p-8 max-w-2xl">
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-green-700 font-semibold text-lg">
            {savedPost?.status === 'posted' ? '投稿しました！' : '保存しました！'}
          </p>
          <p className="text-green-600 text-sm mt-1">
            {savedPost?.status === 'scheduled'
              ? `${scheduledAt} に予約投稿します`
              : savedPost?.status === 'posted'
              ? 'Threadsに投稿されました'
              : '下書きとして保存されました'}
          </p>
          <button
            onClick={handleReset}
            className="mt-4 text-sm text-green-700 underline hover:no-underline"
          >
            新しい投稿を生成する
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">投稿生成</h2>
        <p className="text-gray-500 mt-1">テーマを入力してAIが投稿文と図解を生成します</p>
      </div>

      {/* Step 1: 入力 */}
      {step === 'input' && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              アカウント
            </label>
            <select
              value={selectedAccount}
              onChange={e => setSelectedAccount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {accounts.length === 0 && (
                <option value="">アカウントを先に登録してください</option>
              )}
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              投稿テーマ
            </label>
            <input
              type="text"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              placeholder="例：高卒でも転職できる3つの理由"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedAccount || !theme.trim()}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles size={18} />
            {loading ? '生成中...' : 'AI生成する'}
          </button>
        </div>
      )}

      {/* Step 2: プレビュー・承認 */}
      {step === 'preview' && (
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">投稿文</label>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <RefreshCw size={12} />
                再生成
              </button>
            </div>
            <textarea
              value={generatedText}
              onChange={e => setGeneratedText(e.target.value)}
              rows={8}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{generatedText.length}文字</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-gray-700">図解画像</label>
              <button
                onClick={handleGenerateImage}
                disabled={imageLoading}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <ImageIcon size={12} />
                {imageLoading ? '生成中...' : imageUrl ? '再生成' : '図解を生成'}
              </button>
            </div>
            {imageUrl ? (
              <img src={imageUrl} alt="生成された図解" className="w-full rounded-lg border border-gray-200" />
            ) : (
              <div className="w-full h-40 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-sm text-gray-400">
                「図解を生成」ボタンで画像を作成
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              予約投稿日時（任意）
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSave(false)}
              disabled={loading}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {scheduledAt ? '予約保存' : '下書き保存'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={loading || !!scheduledAt}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
              今すぐ投稿
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
