'use client'

// 図解／投稿画像の生成・編集カード（全SNS共通）。
// AI生成 / 自分でアップロード → プレビュー → 修正指示 → プロンプト確認 までを1コンポーネントに統一。
import { useRef, useState } from 'react'
import { ImageIcon, Wand2, Upload, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { SectionLabel } from '@/components/generate/GenerateParts'
import { cx } from '@/lib/utils'

// アップロード許可形式（マジックバイト検証はサーバー側 /api/upload/image でも実施）
const ACCEPT_IMAGE = 'image/png,image/jpeg,image/webp'
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).replace(/^data:[^;]+;base64,/, ''))
    reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'))
    reader.readAsDataURL(file)
  })
}

interface ImagePanelProps {
  /** カード見出し（例: 図解画像 / 投稿画像（必須）） */
  label: string
  /** 未生成時のボタン文言（例: 図解を生成 / 画像を生成） */
  generateLabel: string
  imageUrl: string
  imageLoading: boolean
  imageEditPrompt: string
  setImageEditPrompt: (v: string) => void
  imageEditing: boolean
  onGenerate: () => void
  onEdit: () => void
  imagePrompt: string
  /** アップロード成功時に公開URLを受け取る（未指定ならアップロードボタンを出さない） */
  onUploaded?: (url: string) => void
  /** アップロード失敗時のエラーメッセージ通知 */
  onUploadError?: (msg: string) => void
  /** 見出し横の補助バッジ（例: 参考画像でテイスト適用） */
  badge?: React.ReactNode
  /** 画像下の注記（例: スレッドの場合は1件目に添付されます） */
  footnote?: React.ReactNode
  /** 空状態の説明文 */
  emptyText: string
  /** 空状態を高め（h-40）にする（Instagram のように画像必須のページ用） */
  emptyTall?: boolean
  /** 生成画像の alt */
  imageAlt?: string
}

export function ImagePanel({
  label, generateLabel,
  imageUrl, imageLoading,
  imageEditPrompt, setImageEditPrompt, imageEditing,
  onGenerate, onEdit, imagePrompt,
  onUploaded, onUploadError,
  badge, footnote, emptyText, emptyTall = false, imageAlt = '生成された画像',
}: ImagePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const busy = imageLoading || uploading
  const canUpload = !!onUploaded

  async function handleFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      onUploadError?.('画像が大きすぎます（5MB以下にしてください）')
      return
    }
    setUploading(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mimeType: file.type }),
      })
      const data = await res.json().catch(() => ({})) as { imageUrl?: string; error?: string }
      if (!res.ok || !data.imageUrl) throw new Error(data.error ?? 'アップロードに失敗しました')
      onUploaded?.(data.imageUrl)
    } catch (e) {
      onUploadError?.(e instanceof Error ? e.message : 'アップロードに失敗しました')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  const uploadButton = (compact: boolean) => (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={busy}
      className={cx(
        'flex items-center gap-1 font-medium text-[#006F83] transition-colors hover:text-[#005A6B] disabled:opacity-50',
        compact ? 'text-xs' : 'rounded-md border border-[#e5edf5] bg-white px-3 py-1.5 text-xs hover:border-[#00A3BF]',
      )}
    >
      {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
      {uploading ? 'アップロード中...' : compact ? 'アップロード' : '画像をアップロード'}
    </button>
  )

  return (
    <Card className="space-y-3">
      {/* 自分で用意した画像のアップロード用（非表示） */}
      {canUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_IMAGE}
          onChange={onPickFile}
          className="hidden"
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SectionLabel>{label}</SectionLabel>
          {badge}
        </div>
        <div className="flex items-center gap-3">
          {canUpload && uploadButton(true)}
          <button
            onClick={onGenerate}
            disabled={busy}
            className="flex items-center gap-1 text-xs font-medium text-[#006F83] transition-colors hover:text-[#005A6B] disabled:opacity-50"
          >
            <ImageIcon className="h-3 w-3" />
            {imageLoading ? '生成中...' : imageUrl ? '再生成' : generateLabel}
          </button>
        </div>
      </div>

      {imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={imageAlt} className="w-full rounded-md" />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={imageEditPrompt}
              onChange={e => setImageEditPrompt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && onEdit()}
              placeholder="修正指示（例：背景を青に、テキストを日本語に）"
              disabled={imageEditing}
              className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden transition placeholder-gray-400 focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20 disabled:opacity-50"
            />
            <button
              onClick={onEdit}
              disabled={!imageEditPrompt.trim() || imageEditing}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#00A3BF] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#008CA8] disabled:opacity-40 sm:w-auto sm:shrink-0"
            >
              <Wand2 className={cx('h-3.5 w-3.5', imageEditing && 'animate-pulse')} />
              {imageEditing ? '修正中...' : '修正'}
            </button>
          </div>
          {footnote && <p className="text-[11px] text-gray-400">{footnote}</p>}
          {imagePrompt && (
            <details className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-medium text-gray-600 hover:text-gray-900">
                🔍 画像生成プロンプトを表示
              </summary>
              <pre className="mt-2 max-h-60 overflow-auto break-words whitespace-pre-wrap text-[11px] leading-relaxed text-gray-700">
                {imagePrompt}
              </pre>
            </details>
          )}
        </>
      ) : (
        <div className={cx(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#e5edf5]',
          emptyTall ? 'h-40' : 'h-32',
        )}>
          <ImageIcon className={cx('text-gray-300', emptyTall ? 'h-6 w-6' : 'h-5 w-5')} />
          <span className="text-xs text-gray-400">{emptyText}</span>
          {canUpload && uploadButton(false)}
        </div>
      )}
    </Card>
  )
}
