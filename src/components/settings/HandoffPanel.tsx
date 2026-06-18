'use client'

// 納品時の引き継ぎパネル（設定ページに表示）。
// エクスポート: プロンプト/下書き(+任意でAPIキー)を JSON ファイルでダウンロード。
// インポート: そのファイルを新環境で取り込む（SNSは同じ表示名で連携済みだと自動で紐づく）。

import { useRef, useState } from 'react'
import { Download, Upload, ArrowLeftRight, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { HandoffImportResult } from '@/lib/handoff'

export function HandoffPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [includeKeys, setIncludeKeys] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [result, setResult] = useState<HandoffImportResult | null>(null)

  async function handleExport() {
    setExporting(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/handoff/export?includeKeys=${includeKeys ? '1' : '0'}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? 'エクスポートに失敗しました')
      }
      const json = await res.json()
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `handoff-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg({ kind: 'success', text: 'エクスポートしました（ファイルをダウンロード）' })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'エクスポートに失敗しました' })
    } finally {
      setExporting(false)
    }
  }

  async function handleImportFile(file: File) {
    setImporting(true)
    setMsg(null)
    setResult(null)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('JSON ファイルとして読み取れませんでした')
      }
      const res = await fetch('/api/handoff/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const data = await res.json().catch(() => ({})) as HandoffImportResult & { error?: string }
      if (!res.ok || data.error) throw new Error(data.error ?? 'インポートに失敗しました')
      setResult(data)
      setMsg({ kind: 'success', text: 'インポートが完了しました' })
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'インポートに失敗しました' })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section aria-labelledby="section-handoff" className="mt-8">
      <h2 id="section-handoff" className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <ArrowLeftRight className="h-3.5 w-3.5" />
        引き継ぎ（エクスポート / インポート）
      </h2>
      <p className="mb-3 text-[11px] text-gray-500">
        プロンプト設定・下書き・予約投稿（＋任意でAPIキー）を別環境へ移せます。SNSのアクセストークンは移行できないため、新環境では各SNSを<strong>同じ表示名</strong>で再連携してください（同名だとプロンプト・下書きが自動で紐づきます）。
      </p>

      {msg && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ring-1 ${
          msg.kind === 'success' ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-red-50 text-red-600 ring-red-200'
        }`}>
          {msg.kind === 'success' ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* エクスポート */}
        <Card className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: '#061b31' }}>エクスポート</p>
          <label className="flex min-h-9 cursor-pointer items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeKeys}
              onChange={e => setIncludeKeys(e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-[#00A3BF]"
            />
            <span>
              APIキーも含める（OpenAI / OpenRouter / ElevenLabs / HeyGen ＋ SNSアプリ鍵）
              {includeKeys && (
                <span className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  ファイルに鍵が平文で含まれます。共有・保管は厳重に（不要になったら削除）。
                </span>
              )}
            </span>
          </label>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            設定をエクスポート
          </Button>
        </Card>

        {/* インポート */}
        <Card className="space-y-3">
          <p className="text-sm font-semibold" style={{ color: '#061b31' }}>インポート</p>
          <p className="text-[11px] text-gray-500">
            先にSNSアカウントを<strong>同じ表示名</strong>で連携しておくと、プロンプトと下書きがそのアカウントに紐づきます。予約投稿は安全のため<strong>下書きとして</strong>取り込まれます（必要に応じて再予約してください）。
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={e => { const f = e.target.files?.[0]; if (f) void handleImportFile(f) }}
            className="hidden"
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            ファイルを選んでインポート
          </Button>

          {result && (
            <div className="rounded-md bg-gray-50 px-3 py-2.5 text-xs text-gray-700">
              <p className="font-medium text-gray-900">取り込み結果</p>
              <ul className="mt-1 space-y-0.5">
                <li>APIキー: {result.apiKeysImported} 件</li>
                <li>プロンプト設定: {result.prompts.imported} 件取込 / {result.prompts.skipped} 件スキップ</li>
                <li>下書き（予約含む）: {result.posts.imported} 件</li>
              </ul>
              {result.unmatchedAccounts.length > 0 && (
                <div className="mt-2 flex items-start gap-1 text-[11px] text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    次のアカウントが未連携のため紐づけできませんでした。同じ表示名で連携してから再インポートすると紐づきます：
                    {' '}{result.unmatchedAccounts.join('、')}
                  </span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </section>
  )
}
