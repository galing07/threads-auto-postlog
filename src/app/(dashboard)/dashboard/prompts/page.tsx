'use client'

import { useEffect, useState } from 'react'
import { Save, RotateCcw, Sparkles, ImageIcon, Lightbulb, CheckCircle, AlertCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'

interface PromptSettings {
  text_extra: string | null
  image_extra: string | null
  themes_extra: string | null
}

const MAX_LEN = 4_000

const PRESETS = {
  text: `# テキスト生成への追加指示の例
- 一人称は「僕」で統一する
- 体験談には必ず数字を1つ以上入れる
- 末尾に絵文字（🙌💡など）を1つだけ置く
- ハッシュタグは控えめに最大3個まで`,
  image: `# 画像生成への追加指示の例
- ブランドカラーは #00A3BF と #F5A623
- 必ず日本語タイトルを大きく入れる
- 角丸の柔らかいデザイン、フォントは Gothic 系
- 人物のシルエットは含めない`,
  themes: `# テーマ提案への追加指示の例
- 「20代」「キャリアチェンジ」というキーワードを軸に
- 検索で当たりそうな具体性のあるタイトル
- 季節感（春＝転職時期など）を1つ反映する`,
}

function SectionCard({
  title,
  description,
  icon: Icon,
  value,
  onChange,
  preset,
  onApplyPreset,
  placeholder,
}: {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  onChange: (v: string) => void
  preset: string
  onApplyPreset: () => void
  placeholder: string
}) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E9F7F9]">
            <Icon className="h-3.5 w-3.5 text-[#00A3BF]" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#061b31' }}>{title}</p>
            <p className="text-[11px] text-gray-500">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onApplyPreset}
          className="flex items-center gap-1 text-[11px] text-[#006F83] hover:text-[#005A6B] transition-colors"
          title="例文を入力欄に挿入"
        >
          <RotateCcw className="h-3 w-3" />
          例文を挿入
        </button>
      </div>
      <Textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={8}
        maxLength={MAX_LEN}
        placeholder={placeholder}
        className="font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{value.length} / {MAX_LEN}</span>
        <span>※ 空欄ならデフォルトのプロンプトをそのまま使用</span>
      </div>
      <details className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <summary className="cursor-pointer">例文プレビュー</summary>
        <pre className="mt-2 whitespace-pre-wrap text-[11px] text-gray-500">{preset}</pre>
      </details>
    </Card>
  )
}

export default function PromptsPage() {
  const [settings, setSettings] = useState<PromptSettings>({
    text_extra: null,
    image_extra: null,
    themes_extra: null,
  })
  const [textExtra, setTextExtra] = useState('')
  const [imageExtra, setImageExtra] = useState('')
  const [themesExtra, setThemesExtra] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/prompts')
      .then(r => r.json())
      .then((d: PromptSettings) => {
        setSettings(d)
        setTextExtra(d.text_extra ?? '')
        setImageExtra(d.image_extra ?? '')
        setThemesExtra(d.themes_extra ?? '')
      })
      .catch(() => setMsg({ kind: 'error', text: '読み込みに失敗しました' }))
      .finally(() => setLoading(false))
  }, [])

  const dirty =
    (textExtra || '') !== (settings.text_extra ?? '') ||
    (imageExtra || '') !== (settings.image_extra ?? '') ||
    (themesExtra || '') !== (settings.themes_extra ?? '')

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textExtra,
          imageExtra,
          themesExtra,
        }),
      })
      const data = await res.json() as PromptSettings & { error?: string }
      if (!res.ok || data.error) {
        setMsg({ kind: 'error', text: data.error ?? '保存に失敗しました' })
        return
      }
      setSettings(data)
      setMsg({ kind: 'success', text: 'プロンプトを保存しました' })
      setTimeout(() => setMsg(null), 3000)
    } catch {
      setMsg({ kind: 'error', text: '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    if (!confirm('変更を取り消してもよろしいですか？')) return
    setTextExtra(settings.text_extra ?? '')
    setImageExtra(settings.image_extra ?? '')
    setThemesExtra(settings.themes_extra ?? '')
  }

  function handleClear() {
    if (!confirm('全てのカスタムプロンプトをクリアしますか？（保存ボタンで確定）')) return
    setTextExtra('')
    setImageExtra('')
    setThemesExtra('')
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
            プロンプト設定
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            生成 AI に渡すプロンプトの「追加指示」をここで編集できます。<br />
            アカウントごとのペルソナ・トーン・テーマは「アカウント」ページ側で設定してください。
          </p>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ring-1 ${
          msg.kind === 'success'
            ? 'bg-green-50 text-green-700 ring-green-200'
            : 'bg-red-50 text-red-600 ring-red-200'
        }`}>
          {msg.kind === 'success'
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00A3BF] border-t-transparent" />
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <SectionCard
              title="テキスト生成（投稿本文）"
              description="OpenRouter Gemini に渡すテキスト生成プロンプトに追加される指示"
              icon={Sparkles}
              value={textExtra}
              onChange={setTextExtra}
              preset={PRESETS.text}
              onApplyPreset={() => setTextExtra(prev => prev ? prev + '\n' + PRESETS.text : PRESETS.text)}
              placeholder="例: 一人称は「僕」で統一・体験談ベース・絵文字は最小限 など"
            />
            <SectionCard
              title="画像生成（図解）"
              description="OpenAI gpt-image-2 に渡す画像生成プロンプトに追加される指示"
              icon={ImageIcon}
              value={imageExtra}
              onChange={setImageExtra}
              preset={PRESETS.image}
              onApplyPreset={() => setImageExtra(prev => prev ? prev + '\n' + PRESETS.image : PRESETS.image)}
              placeholder="例: ブランドカラー #00A3BF・角丸・人物シルエットなし など"
            />
            <SectionCard
              title="テーマ提案"
              description="「テーマを提案」ボタンで使われるテーマ生成プロンプトへの追加指示"
              icon={Lightbulb}
              value={themesExtra}
              onChange={setThemesExtra}
              preset={PRESETS.themes}
              onApplyPreset={() => setThemesExtra(prev => prev ? prev + '\n' + PRESETS.themes : PRESETS.themes)}
              placeholder="例: 20代向け・検索で当たる具体タイトル など"
            />
          </div>

          {/* Action bar */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            <Button
              onClick={handleSave}
              disabled={!dirty || saving}
              isLoading={saving}
              loadingText="保存中..."
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              プロンプトを保存
            </Button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!dirty || saving}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
            >
              変更を取り消す
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              className="ml-auto text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
            >
              全てクリア
            </button>
          </div>
        </>
      )}
    </div>
  )
}
