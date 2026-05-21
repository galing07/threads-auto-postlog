'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Play, Pause, RefreshCw, Pencil, Check, X } from 'lucide-react'
import { cx } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { Scene } from '@/types/database'

interface SceneRowProps {
  scene: Scene
  videoId: string
  onRegenerate: (sceneId: string, target: 'image' | 'audio') => void
  onEdited?: () => void
  regenerating: { sceneId: string; target: 'image' | 'audio' } | null
}

export function SceneRow({ scene, videoId, onRegenerate, onEdited, regenerating }: SceneRowProps) {
  const toast = useToast()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)

  const [editingCaption, setEditingCaption] = useState(false)
  const [captionDraft, setCaptionDraft] = useState(scene.caption_text ?? '')
  const [editingNarration, setEditingNarration] = useState(false)
  const [narrationDraft, setNarrationDraft] = useState(scene.narration_text ?? '')
  const [saving, setSaving] = useState(false)

  // unmount or audio_url 変更時に音声を停止・解放
  useEffect(() => {
    return () => {
      const el = audioRef.current
      if (el) {
        el.pause()
        el.src = ''
        audioRef.current = null
      }
    }
  }, [scene.audio_url])

  // 外部更新（再生成後など）に追従
  useEffect(() => {
    if (!editingCaption) setCaptionDraft(scene.caption_text ?? '')
  }, [scene.caption_text, editingCaption])
  useEffect(() => {
    if (!editingNarration) setNarrationDraft(scene.narration_text ?? '')
  }, [scene.narration_text, editingNarration])

  const imageBusy = regenerating?.sceneId === scene.id && regenerating.target === 'image'
  const audioBusy = regenerating?.sceneId === scene.id && regenerating.target === 'audio'

  function togglePlay() {
    if (!scene.audio_url) return
    const existing = audioRef.current
    if (existing && !existing.paused) {
      existing.pause()
      setPlaying(false)
      return
    }
    const el = existing ?? new Audio(scene.audio_url)
    if (!existing) {
      el.addEventListener('ended', () => setPlaying(false))
      audioRef.current = el
    }
    setAudioError(null)
    el.play()
      .then(() => setPlaying(true))
      .catch(err => {
        setAudioError(err instanceof Error ? err.message : '再生に失敗しました')
        setPlaying(false)
      })
  }

  async function saveTexts(patch: { caption_text?: string; narration_text?: string }) {
    setSaving(true)
    try {
      const res = await fetch(`/api/videos/${videoId}/scenes/${scene.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; narrationChanged?: boolean }
      if (!res.ok) {
        toast.error(data.error ?? '保存に失敗しました')
        return false
      }
      if (data.narrationChanged) {
        toast.success('ナレーションを更新しました。音声を再生成しています')
      } else {
        toast.success('更新しました')
      }
      onEdited?.()
      return true
    } finally {
      setSaving(false)
    }
  }

  async function commitCaption() {
    const ok = await saveTexts({ caption_text: captionDraft })
    if (ok) setEditingCaption(false)
  }
  async function commitNarration() {
    const ok = await saveTexts({ narration_text: narrationDraft })
    if (ok) setEditingNarration(false)
  }

  return (
    <div className="rounded-lg border border-[#e5edf5] bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3 sm:items-start">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">
            {scene.order_index + 1}
          </div>
          <div className="shrink-0">
            {scene.image_url ? (
              <img
                src={scene.image_url}
                alt={`シーン ${scene.order_index + 1}`}
                className="h-20 w-20 rounded-md object-cover sm:h-24 sm:w-24"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-[#e5edf5] bg-gray-50 sm:h-24 sm:w-24">
                <ImageIcon className="h-5 w-5 text-gray-300" />
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {/* キャプション */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">キャプション</span>
              {!editingCaption && (
                <button
                  type="button"
                  onClick={() => setEditingCaption(true)}
                  className="inline-flex items-center gap-1 text-[10px] text-[#00A3BF] hover:underline"
                >
                  <Pencil className="h-3 w-3" /> 編集
                </button>
              )}
            </div>
            {editingCaption ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  value={captionDraft}
                  onChange={e => setCaptionDraft(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-hidden focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
                  placeholder="画面上に表示されるテキスト"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingCaption(false); setCaptionDraft(scene.caption_text ?? '') }}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <X className="h-3 w-3" /> キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={commitCaption}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-md bg-[#00A3BF] px-2 py-1 text-[11px] text-white hover:bg-[#008CA8] disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> 保存
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-0.5 text-sm leading-relaxed text-gray-700">
                {scene.caption_text || <span className="text-gray-400">（未設定）</span>}
              </p>
            )}
          </div>

          {/* ナレーション */}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">ナレーション</span>
              {!editingNarration && (
                <button
                  type="button"
                  onClick={() => setEditingNarration(true)}
                  className="inline-flex items-center gap-1 text-[10px] text-[#00A3BF] hover:underline"
                >
                  <Pencil className="h-3 w-3" /> 編集
                </button>
              )}
            </div>
            {editingNarration ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  value={narrationDraft}
                  onChange={e => setNarrationDraft(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 outline-hidden focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
                  placeholder="音声で読み上げる文章"
                />
                <p className="text-[10px] text-gray-500">保存すると自動で音声を作り直します</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => { setEditingNarration(false); setNarrationDraft(scene.narration_text ?? '') }}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50"
                  >
                    <X className="h-3 w-3" /> キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={commitNarration}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-md bg-[#00A3BF] px-2 py-1 text-[11px] text-white hover:bg-[#008CA8] disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" /> 保存して音声更新
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">
                {scene.narration_text || <span className="text-gray-400">（未設定）</span>}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {scene.duration !== null && (
              <span className="text-[10px] text-gray-400">{scene.duration.toFixed(1)} 秒</span>
            )}
            <button
              type="button"
              onClick={togglePlay}
              disabled={!scene.audio_url}
              className={cx(
                'inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#e5edf5] px-2.5 py-1 text-[11px]',
                scene.audio_url
                  ? 'text-gray-700 hover:bg-[#F8FAFC]'
                  : 'cursor-not-allowed text-gray-300',
              )}
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              音声
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(scene.id, 'image')}
              disabled={imageBusy}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#e5edf5] px-2.5 py-1 text-[11px] text-gray-600 hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <RefreshCw className={cx('h-3 w-3', imageBusy && 'animate-spin')} />
              画像再生成
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(scene.id, 'audio')}
              disabled={audioBusy}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[#e5edf5] px-2.5 py-1 text-[11px] text-gray-600 hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              <RefreshCw className={cx('h-3 w-3', audioBusy && 'animate-spin')} />
              音声再生成
            </button>
          </div>
          {audioError && (
            <p className="mt-1 text-[10px] text-red-500" role="alert">{audioError}</p>
          )}
        </div>
      </div>
    </div>
  )
}
