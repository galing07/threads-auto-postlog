'use client'

import { useEffect, useState } from 'react'
import {
  Sparkles, Send, Save, RefreshCw, ChevronLeft,
  CheckCircle, Lightbulb, Loader2, Video, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { cx } from '@/lib/utils'
import type { Account, Post } from '@/types/database'

type Step = 'input' | 'preview' | 'done'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </p>
  )
}

const TIKTOK_POST_TYPES = [
  { value: 'hook',      label: 'フック型',    desc: '最初3秒で掴む',  emoji: '🪝' },
  { value: 'list',      label: 'リスト型',    desc: 'N個の〇〇',      emoji: '📋' },
  { value: 'story',     label: 'ストーリー型', desc: '体験談・変化',   emoji: '📖' },
  { value: 'tutorial',  label: 'ハウツー型',  desc: 'やり方解説',     emoji: '🎓' },
  { value: 'challenge', label: '問いかけ型',  desc: 'コメント誘導',   emoji: '💬' },
] as const

type TikTokPostType = typeof TIKTOK_POST_TYPES[number]['value']

export default function TikTokGeneratePage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [theme, setTheme] = useState('')
  const [postType, setPostType] = useState<TikTokPostType | ''>('')
  const [step, setStep] = useState<Step>('input')
  const [loading, setLoading] = useState(false)
  const [themeSuggestions, setThemeSuggestions] = useState<string[]>([])
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [generatedScript, setGeneratedScript] = useState('')
  const [generatedSummary, setGeneratedSummary] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoLoading, setVideoLoading] = useState(false)
  const [savedPost, setSavedPost] = useState<Post | null>(null)

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json() as Promise<Account[]>)
      .then(accs => {
        const tiktokAccounts = accs.filter(a => a.platform === 'tiktok')
        setAccounts(tiktokAccounts)
        if (tiktokAccounts.length > 0) setSelectedAccount(tiktokAccounts[0].id)
      })
  }, [])

  const currentAccount = accounts.find(a => a.id === selectedAccount)
  const hasHeyGen = Boolean(currentAccount?.heygen_avatar_id && currentAccount?.heygen_voice_id)
  const isDemoMode = !selectedAccount

  async function handleSuggestThemes() {
    setSuggestLoading(true)
    setThemeSuggestions([])
    try {
      const res = await fetch('/api/generate/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccount || undefined }),
      })
      const data = await res.json() as { themes?: string[]; error?: string }
      if (data.error) throw new Error(data.error)
      setThemeSuggestions(data.themes ?? [])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'テーマ生成に失敗しました')
    } finally {
      setSuggestLoading(false)
    }
  }

  async function handleGenerate(overrideTheme?: string) {
    const targetTheme = overrideTheme ?? theme
    if (!targetTheme.trim()) return
    if (overrideTheme) setTheme(overrideTheme)
    setLoading(true)
    try {
      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount || undefined,
          theme: targetTheme,
          postType: postType || undefined,
          platform: 'tiktok',
        }),
      })
      const data = await res.json() as { content: string; summary: string; error?: string }
      if (data.error) throw new Error(data.error)
      setGeneratedScript(data.content)
      setGeneratedSummary(data.summary ?? '')
      setStep('preview')
    } catch (e) {
      alert(e instanceof Error ? e.message : '生成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerateVideo() {
    if (!generatedScript || !currentAccount) return
    setVideoLoading(true)
    try {
      const res = await fetch('/api/generate/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: generatedScript,
          accountId: currentAccount.id,
          caption: true,
        }),
      })
      const data = await res.json() as { videoUrl?: string; error?: string }
      if (!res.ok || !data.videoUrl) throw new Error(data.error ?? '動画生成に失敗しました')
      setVideoUrl(data.videoUrl)
    } catch (e) {
      alert(e instanceof Error ? e.message : '動画生成に失敗しました')
    } finally {
      setVideoLoading(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount || undefined,
          textContent: generatedScript,
          videoUrl: videoUrl || undefined,
          theme,
          summary: generatedSummary || undefined,
        }),
      })
      const post = await res.json() as Post & { error?: string }
      if (post.error) throw new Error(post.error)
      setSavedPost(post)
      setStep('done')
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep('input')
    setTheme('')
    setPostType('')
    setGeneratedScript('')
    setGeneratedSummary('')
    setVideoUrl('')
    setSavedPost(null)
    setThemeSuggestions([])
  }

  if (step === 'done') {
    return (
      <div className="p-6 lg:p-8 max-w-2xl">
        <Card className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">保存しました！</h2>
          <p className="mt-1 text-sm text-gray-500">下書きとして保存されました</p>
          {videoUrl && (
            <p className="mt-1 text-xs text-gray-400">動画はTikTokアプリから手動で投稿してください</p>
          )}
          <Button onClick={handleReset} className="mt-6 gap-2" style={{ backgroundColor: '#ff2d55', borderColor: '#ff2d55' }}>
            <Sparkles className="h-4 w-4" />
            新しい動画を生成する
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/dashboard/generate" className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="h-4 w-4" />
              戻る
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black">
              <Video className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
              TikTok 動画生成
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 ml-9">トークスクリプト + HeyGenアバター動画を生成</p>
        </div>
        {step === 'preview' && (
          <button onClick={() => setStep('input')} className="mt-6 flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft className="h-4 w-4" />
            入力に戻る
          </button>
        )}
      </div>

      {/* Step 1: 入力 */}
      {step === 'input' && (
        <div className="space-y-5">
          <Card className="space-y-4">
            {/* アカウント選択 */}
            <div>
              <SectionLabel>アカウント</SectionLabel>
              {accounts.length === 0 ? (
                <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-blue-700">デモモードで動作中</p>
                      <p className="mt-0.5 text-xs text-blue-600">
                        アカウント未登録でもスクリプト生成・下書き保存ができます。
                        HeyGen APIを登録後、アカウントを追加するとアバター動画も生成できます。
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  className="w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden transition focus:border-[#ff2d55] focus:ring-2 focus:ring-[#ff2d55]/20"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.heygen_avatar_id ? ' ✓ HeyGen設定済み' : ' （HeyGen未設定）'}
                    </option>
                  ))}
                </select>
              )}

              {selectedAccount && !hasHeyGen && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-600">
                    HeyGenのアバターIDとボイスIDが未設定です。アカウント設定で追加するとアバター動画を生成できます。
                  </p>
                </div>
              )}
            </div>

            {/* テーマ入力 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <SectionLabel>動画テーマ</SectionLabel>
                <button
                  onClick={handleSuggestThemes}
                  disabled={suggestLoading}
                  className="flex items-center gap-1 text-xs font-medium text-[#ff2d55] hover:text-[#d9244a] disabled:opacity-50 transition-colors"
                >
                  <Lightbulb className={cx('h-3 w-3', suggestLoading && 'animate-pulse')} />
                  {suggestLoading ? '考え中...' : 'テーマを提案'}
                </button>
              </div>
              {themeSuggestions.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {themeSuggestions.map(t => (
                    <button
                      key={t}
                      onClick={() => { setTheme(t); setThemeSuggestions([]) }}
                      className={cx(
                        'rounded-full border px-3 py-1 text-xs transition-all text-left',
                        theme === t
                          ? 'border-[#ff2d55] bg-red-50 text-[#ff2d55]'
                          : 'border-[#e5edf5] bg-white text-gray-600 hover:border-[#ff2d55] hover:text-[#ff2d55]',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <input
                value={theme}
                onChange={e => setTheme(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="例：1週間で5kg痩せた方法、朝5時起きのメリット"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden transition placeholder-gray-400 focus:border-[#ff2d55] focus:ring-2 focus:ring-[#ff2d55]/20"
              />
            </div>
          </Card>

          {/* 投稿の型 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel>動画の型</SectionLabel>
              <span className="text-xs text-gray-400">任意</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {TIKTOK_POST_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setPostType(postType === t.value ? '' : t.value)}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-lg border py-3 px-2 text-center transition-all',
                    postType === t.value
                      ? 'border-[#ff2d55] bg-red-50'
                      : 'border-[#e5edf5] bg-white hover:border-pink-200 hover:bg-red-50/30',
                  )}
                >
                  <span className="text-xl leading-none">{t.emoji}</span>
                  <span className={cx('text-xs font-medium leading-tight', postType === t.value ? 'text-[#ff2d55]' : 'text-gray-700')}>
                    {t.label}
                  </span>
                  <span className="text-[10px] text-gray-400 leading-tight">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => handleGenerate()}
            disabled={!theme.trim()}
            isLoading={loading}
            loadingText="生成中..."
            className="w-full gap-2 py-2.5"
            style={theme.trim() ? { backgroundColor: '#ff2d55', borderColor: '#ff2d55' } : {}}
          >
            <Sparkles className="h-4 w-4" />
            スクリプト生成する
          </Button>
        </div>
      )}

      {/* Step 2: プレビュー */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">テーマ</span>
            <span className="text-gray-700">{theme}</span>
            <button onClick={() => setStep('input')} className="ml-auto text-xs text-[#ff2d55] hover:underline">変更</button>
          </div>

          {/* スクリプト */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SectionLabel>トークスクリプト</SectionLabel>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">HeyGenが読み上げます</span>
              </div>
              <button onClick={() => handleGenerate()} disabled={loading} className="flex items-center gap-1 text-xs font-medium text-[#ff2d55] hover:text-[#d9244a] disabled:opacity-50">
                <RefreshCw className={cx('h-3 w-3', loading && 'animate-spin')} />
                再生成
              </button>
            </div>
            <Textarea
              value={generatedScript}
              onChange={e => setGeneratedScript(e.target.value)}
              rows={10}
              className="resize-none border-none bg-transparent p-0 shadow-none focus:ring-0"
            />
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <span className="text-xs text-gray-400">{generatedScript.length} 文字</span>
              <span className="text-xs text-gray-400">
                {Math.round(generatedScript.length / 6)} 秒程度
              </span>
            </div>
          </Card>

          {/* アバター動画 */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SectionLabel>アバター動画</SectionLabel>
                <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">HeyGen + 字幕</span>
              </div>
              {hasHeyGen && (
                <button
                  onClick={handleGenerateVideo}
                  disabled={videoLoading}
                  className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700 disabled:opacity-50"
                >
                  {videoLoading
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Video className="h-3 w-3" />}
                  {videoLoading ? '動画レンダリング中...' : videoUrl ? '再生成' : '動画を生成'}
                </button>
              )}
            </div>

            {!hasHeyGen ? (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700">HeyGenが未設定です</p>
                  <p className="mt-0.5 text-xs text-amber-600">
                    アカウント設定でHeyGen アバターIDとボイスIDを登録すると、アバター動画を自動生成できます。
                    スクリプトのみ下書き保存も可能です（アカウントなしでもOK）。
                  </p>
                </div>
              </div>
            ) : videoUrl ? (
              <video src={videoUrl} controls className="w-full rounded-md bg-black" />
            ) : videoLoading ? (
              <div className="flex h-44 flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-purple-200 bg-purple-50/30">
                <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                <div className="text-center">
                  <p className="text-xs font-medium text-gray-700">動画を生成中...</p>
                  <p className="mt-0.5 text-[10px] text-gray-400">HeyGenで1〜3分かかります。このタブを閉じないでください</p>
                </div>
              </div>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#e5edf5]">
                <Video className="h-5 w-5 text-gray-300" />
                <span className="text-xs text-gray-400">「動画を生成」でアバター動画を作成</span>
              </div>
            )}
          </Card>

          {/* TikTok投稿メモ */}
          <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-medium text-blue-700">TikTok投稿について</p>
            <p className="mt-0.5 text-xs text-blue-600">
              現在はスクリプト・動画の生成と下書き保存に対応しています。
              TikTok Content Posting APIの申請・設定後に自動投稿が利用可能になります。
            </p>
          </div>

          {/* アクション */}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleSave} disabled={loading} isLoading={loading} loadingText="保存中..." className="flex-1 gap-2">
              <Save className="h-4 w-4" />
              下書き保存
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
