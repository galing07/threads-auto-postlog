'use client'

import { useEffect, useState } from 'react'
import { FileText, ImageIcon, Save } from 'lucide-react'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Status = 'idle' | 'loading' | 'loaded' | 'error'
type Tab = 'text' | 'image'

interface PromptResponse {
  text_prompt: string | null
  image_prompt: string | null
  text_default: string
  image_default: string
}

/**
 * アカウントのテキスト/画像生成プロンプトを編集・保存する共通パネル。
 * threads / instagram / x の各 generate ページで共有する。
 * バックエンド: GET/PUT /api/prompts（text_prompt / image_prompt / themes_prompt 対応）。
 *
 * - タブで「文章生成」「画像生成」のプロンプトを切り替え
 * - `{波括弧}` は生成時に実値へ置換されるテンプレート変数
 * - 「デフォルトに戻す」で空保存 = サーバー側デフォルトに戻る
 */
export function AccountPromptPanel({ accountId }: { accountId: string }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('text')

  const [textVal, setTextVal] = useState('')
  const [textDefault, setTextDefault] = useState('')
  const [imageVal, setImageVal] = useState('')
  const [imageDefault, setImageDefault] = useState('')

  const [status, setStatus] = useState<Status>('idle')
  const [saving, setSaving] = useState(false)

  const canEdit = !!accountId

  useEffect(() => {
    if (!accountId) {
      setStatus('idle')
      setTextVal(''); setTextDefault(''); setImageVal(''); setImageDefault('')
      return
    }
    const ctrl = new AbortController()
    setStatus('loading')
    fetch(`/api/prompts?accountId=${encodeURIComponent(accountId)}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`status ${r.status}`)
        return await r.json() as PromptResponse
      })
      .then(d => {
        if (ctrl.signal.aborted) return
        setTextVal(d.text_prompt ?? d.text_default)
        setTextDefault(d.text_default)
        setImageVal(d.image_prompt ?? d.image_default)
        setImageDefault(d.image_default)
        setStatus('loaded')
      })
      .catch(e => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        console.error('[AccountPromptPanel] load failed', e instanceof Error ? e.message : 'unknown')
        setStatus('error')
      })
    return () => ctrl.abort()
  }, [accountId])

  async function save(kind: Tab) {
    if (!canEdit) return
    setSaving(true)
    try {
      // 値がデフォルトと同一なら空文字を送る = サーバー側デフォルトに戻す（カスタム解除）
      const body = kind === 'text'
        ? { accountId, textPrompt: textVal === textDefault ? '' : textVal }
        : { accountId, imagePrompt: imageVal === imageDefault ? '' : imageVal }
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast.error(data.error ?? '保存に失敗しました')
        return
      }
      toast.success(kind === 'text' ? '文章プロンプトを保存しました' : '画像プロンプトを保存しました')
    } finally {
      setSaving(false)
    }
  }

  const activeVal = tab === 'text' ? textVal : imageVal
  const setActiveVal = tab === 'text' ? setTextVal : setImageVal
  const activeDefault = tab === 'text' ? textDefault : imageDefault

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#E9F7F9]">
          <FileText className="h-3.5 w-3.5 text-[#00A3BF]" />
        </div>
        <p className="text-sm font-semibold" style={{ color: '#061b31' }}>
          このアカウントのプロンプト
        </p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
        <span className="font-mono">{'{波括弧}'}</span> は生成時に実際の値へ置換されます。ここで直接編集して保存できます。
      </p>

      {/* タブ: 文章生成 / 画像生成 */}
      <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setTab('text')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
            tab === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          文章生成
        </button>
        <button
          type="button"
          onClick={() => setTab('image')}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
            tab === 'image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          画像生成
        </button>
      </div>

      <div className="mt-3">
        {status === 'idle' && (
          <p className="rounded-md border border-[#e5edf5] bg-[#F8FAFC] p-3 text-[11px] leading-relaxed text-gray-500">
            アカウントを選択すると、そのアカウントのプロンプトを表示・編集できます
          </p>
        )}
        {status === 'loading' && (
          <p className="rounded-md border border-[#e5edf5] bg-[#F8FAFC] p-3 text-[11px] text-gray-500">読み込み中...</p>
        )}
        {status === 'error' && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-[11px] text-red-500">プロンプトの取得に失敗しました</p>
        )}
        {status === 'loaded' && (
          <>
            <Textarea
              value={activeVal}
              onChange={e => setActiveVal(e.target.value)}
              disabled={!canEdit || saving}
              rows={16}
              aria-label={tab === 'text' ? '文章生成プロンプト' : '画像生成プロンプト'}
              className="font-mono text-[11px] leading-relaxed"
            />
            <div className="mt-2 flex items-center gap-3">
              <Button
                onClick={() => void save(tab)}
                disabled={!canEdit || saving}
                isLoading={saving}
                loadingText="保存中..."
                className="gap-1.5 py-1.5 text-xs"
              >
                <Save className="h-3.5 w-3.5" />
                保存
              </Button>
              <button
                type="button"
                onClick={() => setActiveVal(activeDefault)}
                disabled={!canEdit || saving}
                className="text-[11px] text-gray-500 transition-colors hover:text-gray-700 disabled:opacity-40"
              >
                デフォルトに戻す
              </button>
            </div>
            {!canEdit && (
              <p className="mt-1.5 text-[10px] text-gray-500">
                デモモードでは編集できません。アカウントを選択してください。
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}
