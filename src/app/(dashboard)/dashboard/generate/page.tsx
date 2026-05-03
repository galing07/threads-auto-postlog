'use client'

import { useEffect, useState } from 'react'
import { Sparkles, ImageIcon, Send, Save, RefreshCw, ChevronLeft, CheckCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { cx } from '@/lib/utils'
import type { Account, Post } from '@/types/database'

type Step = 'input' | 'preview' | 'done'
type PostType = 'buzz' | 'empathy' | 'numbers' | 'story' | 'question'

const POST_TYPES: { value: PostType; label: string; desc: string; emoji: string }[] = [
  { value: 'buzz', label: 'バズ型', desc: '逆説・驚き', emoji: '⚡' },
  { value: 'empathy', label: '共感型', desc: '心の声代弁', emoji: '🤝' },
  { value: 'numbers', label: '数字型', desc: '具体数字', emoji: '📊' },
  { value: 'story', label: 'ストーリー型', desc: '起承転結', emoji: '📖' },
  { value: 'question', label: '問いかけ型', desc: 'コメント誘導', emoji: '💬' },
]

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">{children}</p>
  )
}

export default function GeneratePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [theme, setTheme] = useState('')
  const [postType, setPostType] = useState<PostType | ''>('')
  const [step, setStep] = useState<Step>('input')
  const [loading, setLoading] = useState(false)
  const [generatedText, setGeneratedText] = useState('')
  const [generatedSummary, setGeneratedSummary] = useState('')
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
        body: JSON.stringify({ accountId: selectedAccount, theme, postType: postType || undefined }),
      })
      const data = await res.json() as { content: string; summary: string }
      setGeneratedText(data.content)
      setGeneratedSummary(data.summary ?? '')
      setStep('preview')
    } catch {
      alert('生成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateImage() {
    if (!generatedText) return
    setImageLoading(true)
    try {
      const res = await fetch('/api/generate/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postContent: generatedText, style: 'diagram' }),
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
          theme,
          scheduledAt: scheduledAt || undefined,
          summary: generatedSummary || undefined,
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
    setPostType('')
    setGeneratedText('')
    setGeneratedSummary('')
    setImageUrl('')
    setScheduledAt('')
    setSavedPost(null)
  }

  if (step === 'done') {
    return (
      <div className="p-8 max-w-2xl">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">
            {savedPost?.status === 'posted' ? '投稿しました！' : '保存しました！'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {savedPost?.status === 'scheduled'
              ? `${scheduledAt} に予約投稿します`
              : savedPost?.status === 'posted'
              ? 'Threadsに投稿されました'
              : '下書きとして保存されました'}
          </p>
          <Button onClick={handleReset} className="mt-6 gap-2">
            <Sparkles className="h-4 w-4" />
            新しい投稿を生成する
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">投稿生成</h1>
          <p className="mt-1 text-sm text-gray-500">AIがテーマを Threads 投稿に変換します</p>
        </div>
        {step === 'preview' && (
          <button
            onClick={() => setStep('input')}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            <ChevronLeft className="h-4 w-4" />
            戻る
          </button>
        )}
      </div>

      {/* Step 1 */}
      {step === 'input' && (
        <div className="space-y-5">
          <Card className="space-y-4">
            <div>
              <Label>アカウント</Label>
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                className={cx(
                  'w-full appearance-none rounded-md border px-3 py-2 text-sm outline-hidden transition',
                  'border-gray-300 bg-white text-gray-900',
                  'focus:border-blue-500 focus:ring-2 focus:ring-blue-200',
                )}
              >
                {accounts.length === 0 && <option value="">アカウントを先に登録してください</option>}
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <Label>投稿テーマ</Label>
              <Input
                value={theme}
                onChange={e => setTheme(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="例：高卒でも転職できる3つの理由"
              />
            </div>
          </Card>

          {/* Post type picker */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>投稿の型</Label>
              <span className="text-xs text-gray-400">任意</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {POST_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setPostType(postType === t.value ? '' : t.value)}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-lg border py-3 px-2 text-center transition-all text-sm',
                    postType === t.value
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  <span className="text-xl leading-none">{t.emoji}</span>
                  <span className={cx('text-xs font-medium leading-tight', postType === t.value ? 'text-blue-700' : 'text-gray-700')}>
                    {t.label}
                  </span>
                  <span className="text-[10px] text-gray-400 leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={!selectedAccount || !theme.trim()}
            isLoading={loading}
            loadingText="生成中..."
            className="w-full gap-2 py-2.5"
          >
            <Sparkles className="h-4 w-4" />
            AI生成する
          </Button>
        </div>
      )}

      {/* Step 2 */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Text */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>投稿文</Label>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={cx('h-3 w-3', loading && 'animate-spin')} />
                再生成
              </button>
            </div>
            <Textarea
              value={generatedText}
              onChange={e => setGeneratedText(e.target.value)}
              rows={9}
              className="resize-none border-none bg-transparent p-0 shadow-none focus:ring-0"
            />
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <span className="text-xs text-gray-400">{generatedText.length} 文字</span>
              <div className={cx(
                'h-1.5 w-1.5 rounded-full',
                generatedText.length > 450 ? 'bg-red-400' : generatedText.length > 350 ? 'bg-yellow-400' : 'bg-emerald-400',
              )} />
            </div>
          </Card>

          {/* Image */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>図解画像</Label>
              <button
                onClick={handleGenerateImage}
                disabled={imageLoading}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                <ImageIcon className="h-3 w-3" />
                {imageLoading ? '生成中...' : imageUrl ? '再生成' : '図解を生成'}
              </button>
            </div>
            {imageUrl ? (
              <img src={imageUrl} alt="生成された図解" className="w-full rounded-md" />
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200">
                <ImageIcon className="h-5 w-5 text-gray-300" />
                <span className="text-xs text-gray-400">「図解を生成」で追加</span>
              </div>
            )}
          </Card>

          {/* Schedule */}
          <Card className="space-y-2">
            <Label>予約投稿</Label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className={cx(
                'rounded-md border px-3 py-2 text-sm outline-hidden transition',
                'border-gray-300 bg-white text-gray-900',
                'focus:border-blue-500 focus:ring-2 focus:ring-blue-200',
              )}
            />
            {!scheduledAt && <p className="text-xs text-gray-400">空白の場合は下書き保存になります</p>}
          </Card>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => handleSave(false)}
              disabled={loading}
              className="flex-1 gap-2"
            >
              <Save className="h-4 w-4" />
              {scheduledAt ? '予約保存' : '下書き保存'}
            </Button>
            <Button
              onClick={() => handleSave(true)}
              disabled={loading || !!scheduledAt}
              isLoading={loading}
              loadingText="投稿中..."
              className="flex-1 gap-2"
            >
              <Send className="h-4 w-4" />
              今すぐ投稿
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
