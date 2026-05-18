'use client'

import { useCallback, useEffect, useState } from 'react'
import { Save, Sparkles, ImageIcon, Lightbulb, RotateCcw, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { SelectNative } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PROMPT_PRESETS, TEXT_PROMPT_VARS, type PromptKind } from '@/lib/ai/prompt-presets'
import type { Account } from '@/types/database'

interface PromptResponse {
  account_id: string
  text_prompt: string | null
  image_prompt: string | null
  themes_prompt: string | null
  text_default: string
  image_default: string
  themes_default: string
  updated_at: string | null
}

const KIND_ORDER: PromptKind[] = ['text', 'image', 'themes']

const KIND_ICON: Record<PromptKind, React.ComponentType<{ className?: string }>> = {
  text: Sparkles,
  image: ImageIcon,
  themes: Lightbulb,
}

interface Drafts {
  text: string
  image: string
  themes: string
}

function defaultFor(data: PromptResponse, kind: PromptKind): string {
  if (kind === 'text') return data.text_default
  if (kind === 'image') return data.image_default
  return data.themes_default
}

function savedFor(data: PromptResponse, kind: PromptKind): string | null {
  if (kind === 'text') return data.text_prompt
  if (kind === 'image') return data.image_prompt
  return data.themes_prompt
}

function draftsFromResponse(data: PromptResponse): Drafts {
  return {
    text: data.text_prompt ?? data.text_default,
    image: data.image_prompt ?? data.image_default,
    themes: data.themes_prompt ?? data.themes_default,
  }
}

export default function PromptsPage() {
  const toast = useToast()
  const confirm = useConfirm()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [data, setData] = useState<PromptResponse | null>(null)
  const [drafts, setDrafts] = useState<Drafts>({ text: '', image: '', themes: '' })
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/accounts')
      .then(r => r.json())
      .then((d: Account[]) => {
        const list = Array.isArray(d) ? d : []
        setAccounts(list)
        if (list.length > 0) setSelectedAccount(list[0].id)
      })
      .catch(() => setLoadError('アカウントの読み込みに失敗しました'))
      .finally(() => setAccountsLoading(false))
  }, [])

  const loadSettings = useCallback(async (accountId: string) => {
    setSettingsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/prompts?accountId=${encodeURIComponent(accountId)}`)
      const json = await res.json() as PromptResponse & { error?: string }
      if (!res.ok || json.error) {
        setLoadError(json.error ?? '読み込みに失敗しました')
        setData(null)
        return
      }
      setData(json)
      setDrafts(draftsFromResponse(json))
    } catch {
      setLoadError('読み込みに失敗しました')
      setData(null)
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedAccount) loadSettings(selectedAccount)
  }, [selectedAccount, loadSettings])

  const dirty = data !== null && KIND_ORDER.some(kind => {
    const current = drafts[kind]
    const baseline = savedFor(data, kind) ?? defaultFor(data, kind)
    return current !== baseline
  })

  async function handleAccountChange(nextId: string) {
    if (nextId === selectedAccount) return
    if (dirty) {
      const ok = await confirm({
        title: '未保存の変更があります',
        message: 'アカウントを切り替えると編集中の内容は破棄されます。続行しますか？',
        confirmLabel: '破棄して切替',
        destructive: true,
      })
      if (!ok) return
    }
    setSelectedAccount(nextId)
  }

  async function handleResetSection(kind: PromptKind) {
    if (!data) return
    const ok = await confirm({
      title: 'デフォルトに戻す',
      message: `「${PROMPT_PRESETS[kind].label}」をデフォルトのプロンプト全文に置き換えます。編集中の内容は失われます。`,
      confirmLabel: 'デフォルトに戻す',
      destructive: true,
    })
    if (!ok) return
    setDrafts(prev => ({ ...prev, [kind]: defaultFor(data, kind) }))
  }

  async function handleSave() {
    if (!selectedAccount || !data) return
    setSaving(true)
    try {
      // デフォルト全文と完全一致するセクションは空文字で送り NULL（=デフォルトに戻す）として保存する
      const payload = {
        accountId: selectedAccount,
        textPrompt: drafts.text === data.text_default ? '' : drafts.text,
        imagePrompt: drafts.image === data.image_default ? '' : drafts.image,
        themesPrompt: drafts.themes === data.themes_default ? '' : drafts.themes,
      }
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as PromptResponse & { error?: string }
      if (!res.ok || json.error) {
        toast.error(json.error ?? '保存に失敗しました')
        return
      }
      setData(json)
      setDrafts(draftsFromResponse(json))
      toast.success('保存しました')
    } catch {
      toast.error('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
          プロンプト設定
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">
          アカウントごとに、生成に使うプロンプトのデフォルト全文を直接編集できます。空にして保存するとデフォルトに戻ります。
        </p>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-200">
          <span>{loadError}</span>
        </div>
      )}

      {accountsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00A3BF] border-t-transparent" />
        </div>
      ) : accounts.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
            <Users className="h-5 w-5 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">アカウントがありません</p>
          <p className="mt-0.5 text-xs text-gray-400">アカウントを先に追加してください</p>
        </Card>
      ) : (
        <>
          <Card className="mb-4 flex items-center gap-3 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E9F7F9]">
              <Users className="h-4 w-4 text-[#00A3BF]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">対象アカウント</p>
              <SelectNative
                value={selectedAccount}
                onChange={e => handleAccountChange(e.target.value)}
                disabled={settingsLoading || saving}
                className="mt-1"
                aria-label="プロンプト設定の対象アカウント"
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    [{a.platform}] {a.name}
                  </option>
                ))}
              </SelectNative>
            </div>
          </Card>

          {settingsLoading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00A3BF] border-t-transparent" />
            </div>
          ) : data ? (
            <>
              <div className="space-y-4">
                {KIND_ORDER.map(kind => {
                  const meta = PROMPT_PRESETS[kind]
                  const Icon = KIND_ICON[kind]
                  const isDefault = drafts[kind] === defaultFor(data, kind)
                  return (
                    <Card key={kind} className="space-y-3">
                      <div className="flex items-start gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#E9F7F9]">
                          <Icon className="h-3.5 w-3.5 text-[#00A3BF]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: '#061b31' }}>{meta.label}</p>
                          <p className="text-[11px] text-gray-500">{meta.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleResetSection(kind)}
                          disabled={saving || isDefault}
                          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <RotateCcw className="h-3 w-3" />
                          デフォルトに戻す
                        </button>
                      </div>

                      <Textarea
                        value={drafts[kind]}
                        onChange={e => setDrafts(prev => ({ ...prev, [kind]: e.target.value }))}
                        rows={14}
                        disabled={saving}
                        className="font-mono text-xs leading-relaxed"
                        aria-label={`${meta.label}のプロンプト全文`}
                      />

                      {kind === 'text' && (
                        <div className="rounded-md bg-gray-50 px-3 py-2.5">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            使える変数
                          </p>
                          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {TEXT_PROMPT_VARS.map(v => (
                              <li key={v.key} className="text-[11px] leading-relaxed text-gray-600">
                                <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px] text-[#006F83] ring-1 ring-gray-200">
                                  {`{${v.key}}`}
                                </code>{' '}
                                — {v.desc}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[10px] text-gray-400">
                            ※ <code className="font-mono">{'{persona}'}</code> などの変数は生成実行時に実際の値へ自動で置換されます。記述を残しておくと差し込まれます。
                          </p>
                        </div>
                      )}

                      {isDefault && (
                        <p className="text-[11px] text-gray-400">
                          現在デフォルトと同じ内容です。このまま保存するとデフォルト使用（未保存）になります。
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  isLoading={saving}
                  loadingText="保存中..."
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  このアカウントに保存
                </Button>
                {data.updated_at && (
                  <span className="text-[11px] text-gray-400">
                    最終保存: {new Date(data.updated_at).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
