'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Send, Trash2, User, ImageIcon, RefreshCw,
  CheckCircle, ChevronDown, ChevronUp, X, Video as VideoIcon, Plus, Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { VideoCard } from '@/components/videos/VideoCard'
import { cx } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useModalA11y } from '@/lib/hooks/use-modal-a11y'
import type { Account, Post, Video } from '@/types/database'

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  draft:      { label: '下書き',   cls: 'bg-gray-100 text-gray-600' },
  scheduled:  { label: '予約',     cls: 'bg-[#E9F7F9] text-[#006F83]' },
  publishing: { label: '投稿中',   cls: 'bg-blue-50 text-blue-600' },
  posted:     { label: '投稿済み', cls: 'bg-green-50 text-green-700' },
  failed:     { label: 'エラー',   cls: 'bg-red-50 text-red-600' },
}

/** datetime-local の値(ローカル時刻)を ISO(UTC) に変換。空なら null。 */
function localInputToIso(v: string): string | null {
  if (!v) return null
  const d = new Date(v) // "YYYY-MM-DDTHH:mm" はローカル時刻として解釈される
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** datetime-local の min 属性用に「今(ローカル)」を YYYY-MM-DDTHH:mm で返す。 */
function localNowForInput(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16)
}

/** ISO(UTC) を datetime-local 入力欄用のローカル時刻文字列に変換（予約時刻の編集プリフィル用）。 */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16)
}

// 投稿先プラットフォームのバッジ（どのSNSに投稿するか/したかを一目で分かるように）
const PLATFORM_BADGE: Record<string, { label: string; cls: string }> = {
  threads:   { label: 'Threads',   cls: 'bg-gray-900 text-white' },
  instagram: { label: 'Instagram', cls: 'bg-gradient-to-r from-pink-500 to-orange-400 text-white' },
  x:         { label: 'X',         cls: 'bg-black text-white' },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }
  // 年をまたぐ予約・古い下書きの誤認を防ぐため、今年と違う場合だけ年を出す
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
  return d.toLocaleString('ja-JP', opts)
}

interface AccountOption {
  id: string
  name: string
  platform: string
}

// 下書き一覧の「動画」タブ用。/api/videos は scenes を count 形・thumbnail なしで返す
interface VideoListItem extends Video {
  scenes?: { count: number }[] | null
  thumbnail_url?: string | null
}

function DraftCard({
  post,
  accounts,
  onPublish,
  onSchedule,
  onCancelSchedule,
  onDelete,
  publishing,
  scheduling,
  deleting,
}: {
  post: Post
  accounts: AccountOption[]
  onPublish: (id: string, accountId?: string) => void
  onSchedule: (id: string, scheduledAtIso: string, accountId?: string) => void
  onCancelSchedule: (id: string) => void
  onDelete: (id: string) => void
  publishing: boolean
  scheduling: boolean
  deleting: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
  const imgModalRef = useModalA11y<HTMLDivElement>(imgOpen, () => setImgOpen(false))
  // account_id 未割当の post に対する選択中アカウント。
  // 初期値を空にすることで「最初の1つに暗黙投稿」事故を防ぐ → 明示的に選ぶまで投稿ボタン disabled。
  const [pickerAccountId, setPickerAccountId] = useState<string>('')
  // 予約日時（datetime-local の値・ローカル時刻文字列）。予約済みカードは現在の予約時刻をプリフィル。
  const [scheduleAt, setScheduleAt] = useState<string>(
    post.status === 'scheduled' && post.scheduled_at ? isoToLocalInput(post.scheduled_at) : '',
  )
  // 投稿/予約に使う実効アカウント（既存 account_id 優先、無ければ選択中）
  const effectiveAccountId = post.account_id ?? (pickerAccountId || '')

  const { label, cls } = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft
  // 投稿先アカウント（account_id → accounts から解決）。下書き=「ここに投稿する」、投稿済み=「ここに投稿した」。
  const account = post.account_id ? accounts.find(a => a.id === post.account_id) : undefined
  const pb = account ? PLATFORM_BADGE[account.platform] : undefined
  const text = post.text_content ?? ''
  const isLong = text.length > 120
  const displayText = isLong && !expanded ? text.slice(0, 120) + '…' : text

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex gap-0">
        {/* メディアエリア（画像 > なし） */}
        <div className="shrink-0">
          {post.image_url ? (
            <>
              <button
                type="button"
                onClick={() => setImgOpen(true)}
                aria-label="投稿画像を拡大表示"
                className="block rounded-md focus-visible:outline-2 focus-visible:outline-[#00A3BF] focus-visible:outline-offset-2"
              >
                <img
                  src={post.image_url}
                  alt="投稿画像"
                  className="h-36 w-36 object-cover transition hover:opacity-90"
                />
              </button>
              {imgOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                  onClick={() => setImgOpen(false)}
                >
                  <div
                    ref={imgModalRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="投稿画像のプレビュー"
                    className="relative"
                  >
                    <img
                      src={post.image_url}
                      alt="投稿画像"
                      className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
                      onClick={e => e.stopPropagation()}
                    />
                    <button
                      type="button"
                      onClick={() => setImgOpen(false)}
                      aria-label="閉じる"
                      className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-gray-700 shadow hover:bg-white focus-visible:outline-2 focus-visible:outline-[#00A3BF]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-36 w-36 flex-col items-center justify-center bg-gray-50">
              <ImageIcon className="h-6 w-6 text-gray-200" />
              <span className="mt-1 text-[10px] text-gray-300">なし</span>
            </div>
          )}
        </div>

        {/* テキストエリア */}
        <div className="flex min-w-0 flex-1 flex-col p-4">
          {/* メタ情報 */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', cls)}>
              {label}
            </span>
            {/* 投稿先（どのSNS・どのアカウントに投稿する/したか）を明示 */}
            {account && pb ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                <span className="text-gray-400">{post.status === 'posted' ? '投稿先' : '→'}</span>
                <span className={cx('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold', pb.cls)}>
                  {pb.label}
                </span>
                <span className="max-w-[150px] truncate font-medium text-gray-700">{account.name}</span>
              </span>
            ) : (post.status === 'draft' || post.status === 'failed') ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                <User className="h-3 w-3" />投稿先未選択
              </span>
            ) : null}
            {post.theme && (
              <span className="truncate text-[11px] text-gray-500">#{post.theme}</span>
            )}
            <span className="ml-auto text-[11px] text-gray-500">
              {formatDate(post.created_at)}
            </span>
          </div>

          {/* 投稿本文 */}
          <p className="flex-1 whitespace-pre-line text-sm leading-relaxed text-gray-700">
            {displayText}
          </p>

          {/* 失敗理由（なぜ失敗したか分かるように。再投稿はアクション行の「今すぐ投稿」から） */}
          {post.status === 'failed' && post.error_message && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-600">
              <span className="font-medium">投稿に失敗しました：</span>
              <span className="break-words">{post.error_message}</span>
            </div>
          )}

          {/* 展開ボタン & アクション */}
          <div className="mt-2 flex items-center gap-3">
            {isLong && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-0.5 text-xs text-[#006F83] hover:text-[#005A6B] transition-colors"
              >
                {expanded
                  ? <><ChevronUp className="h-3.5 w-3.5" />閉じる</>
                  : <><ChevronDown className="h-3.5 w-3.5" />続きを見る</>
                }
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* 予約済み: 予約時刻 + 時刻変更 + 取消 */}
              {post.status === 'scheduled' && (
                <>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#006F83]">
                    <Clock className="h-3.5 w-3.5" />
                    {post.scheduled_at ? `${formatDate(post.scheduled_at)} に投稿予定` : '予約済み'}
                  </span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    min={localNowForInput()}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    aria-label="予約日時を変更"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 outline-hidden focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const iso = localInputToIso(scheduleAt)
                      if (!iso) return
                      onSchedule(post.id, iso) // 予約中→再予約（schedule API が scheduled でも再設定を許可）
                    }}
                    disabled={scheduling || !scheduleAt || (!!post.scheduled_at && isoToLocalInput(post.scheduled_at) === scheduleAt)}
                    isLoading={scheduling}
                    loadingText="変更中..."
                    className="gap-1 py-1 px-2.5 text-xs"
                  >
                    時刻を変更
                  </Button>
                  <button
                    onClick={() => onCancelSchedule(post.id)}
                    disabled={scheduling}
                    className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                  >
                    予約取消
                  </button>
                </>
              )}

              {/* 下書き / 失敗: アカウント未割当なら選択 */}
              {(post.status === 'draft' || post.status === 'failed') && !post.account_id && accounts.length === 0 && (
                <span className="text-[11px] text-amber-600">投稿先アカウントを先に追加してください</span>
              )}
              {(post.status === 'draft' || post.status === 'failed') && !post.account_id && accounts.length > 0 && (
                <select
                  value={pickerAccountId}
                  onChange={(e) => setPickerAccountId(e.target.value)}
                  aria-label="投稿先アカウント"
                  className="appearance-none rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 outline-hidden focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
                >
                  <option value="">アカウントを選択</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}（{a.platform}）
                    </option>
                  ))}
                </select>
              )}

              {/* 下書き / 失敗: 日時ピッカー + 予約 + 今すぐ投稿（アカウント確定後に有効） */}
              {(post.status === 'draft' || post.status === 'failed') && (post.account_id || accounts.length > 0) && (
                <>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    min={localNowForInput()}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    aria-label="予約日時"
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 outline-hidden focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const iso = localInputToIso(scheduleAt)
                      if (!iso || !effectiveAccountId) return
                      onSchedule(post.id, iso, post.account_id ? undefined : effectiveAccountId)
                    }}
                    disabled={scheduling || publishing || !scheduleAt || !effectiveAccountId}
                    isLoading={scheduling}
                    loadingText="予約中..."
                    className="gap-1 py-1 px-2.5 text-xs"
                  >
                    <Clock className="h-3 w-3" />
                    予約
                  </Button>
                  <Button
                    onClick={() => onPublish(post.id, post.account_id ? undefined : effectiveAccountId)}
                    disabled={publishing || scheduling || !effectiveAccountId}
                    isLoading={publishing}
                    loadingText="投稿中..."
                    className="gap-1 py-1 px-2.5 text-xs"
                  >
                    <Send className="h-3 w-3" />
                    今すぐ投稿
                  </Button>
                </>
              )}

              {/* 削除（投稿済み以外） */}
              {post.status !== 'posted' && (
                <button
                  onClick={() => onDelete(post.id)}
                  disabled={deleting}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />
                  削除
                </button>
              )}
              {post.status === 'posted' && (
                <span className="flex items-center gap-1 text-[11px] text-green-600">
                  <CheckCircle className="h-3.5 w-3.5" />投稿済み
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function DraftsPage() {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const [posts, setPosts] = useState<Post[]>([])
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [videos, setVideos] = useState<VideoListItem[]>([])
  const [filter, setFilter] = useState<'all' | 'draft' | 'scheduled' | 'posted' | 'failed' | 'video'>('all')

  async function load(signal?: AbortSignal) {
    setLoading(true)
    try {
      // posts と accounts を並列取得
      const [postsRes, accountsRes, videosRes] = await Promise.all([
        fetch('/api/posts', { signal }),
        fetch('/api/accounts', { signal }),
        fetch('/api/videos', { signal }),
      ])

      if (!postsRes.ok) throw new Error(`posts HTTP ${postsRes.status}`)
      const postsData = await postsRes.json() as Post[]
      setPosts(Array.isArray(postsData) ? postsData : [])

      if (accountsRes.ok) {
        const raw = await accountsRes.json() as Account[] | { accounts?: Account[] }
        const list = Array.isArray(raw) ? raw : (raw.accounts ?? [])
        // posts 投稿先となるプラットフォーム (threads / instagram / x) のみ抽出
        const filtered: AccountOption[] = (list as Account[])
          .filter((a) => a.platform === 'threads' || a.platform === 'instagram' || a.platform === 'x')
          .map((a) => ({ id: a.id, name: a.name, platform: a.platform }))
        setAccounts(filtered)
      }

      // 動画は補助表示。取得に失敗しても下書き本体は表示するため throw しない
      if (videosRes.ok) {
        const vraw = await videosRes.json() as { videos?: VideoListItem[] }
        setVideos(Array.isArray(vraw.videos) ? vraw.videos : [])
      } else {
        setVideos([])
      }
    } catch (e) {
      // アンマウント等による中断は無視
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error('[drafts load]', e instanceof Error ? e.message : 'unknown')
      toast.error('読み込みに失敗しました。通信状況を確認して再読み込みしてください。')
    } finally {
      // 成功・失敗いずれでもローディングを必ず解除 (永久スピナー防止)
      // 中断時は setState を避ける (アンマウント後の警告防止)
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const ctrl = new AbortController()
    void load(ctrl.signal)
    return () => ctrl.abort()
    // load は再生成されるが初回マウントのみで使うので依存は空でよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handlePublish(postId: string, accountId?: string) {
    // 本番SNSへの即時公開は取り消せないため、誤クリック防止に確認を挟む
    const targetPost = posts.find(p => p.id === postId)
    const acc = accounts.find(a => a.id === (accountId ?? targetPost?.account_id ?? ''))
    const ok = await confirm({
      title: '今すぐ投稿しますか？',
      message: acc
        ? `「${acc.name}」（${acc.platform}）に今すぐ公開します。公開後は取り消せません。`
        : '今すぐ公開します。公開後は取り消せません。',
      confirmLabel: '投稿する',
    })
    if (!ok) return
    setPublishing(postId)
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: accountId ? JSON.stringify({ accountId }) : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast.error(data.error ?? '投稿に失敗しました')
        return
      }
      toast.success('投稿しました')
      // 全件 refetch せず該当 post だけローカルで posted に更新
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, status: 'posted', account_id: accountId ?? p.account_id }
          : p,
      ))
    } finally {
      setPublishing(null)
    }
  }

  async function handleSchedule(postId: string, scheduledAtIso: string, accountId?: string) {
    setScheduling(postId)
    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: scheduledAtIso, ...(accountId ? { accountId } : {}) }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string; scheduled_at?: string }
      if (!res.ok) {
        toast.error(data.error ?? '予約に失敗しました')
        return
      }
      toast.success('予約しました')
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, status: 'scheduled', scheduled_at: data.scheduled_at ?? scheduledAtIso, account_id: accountId ?? p.account_id }
          : p,
      ))
    } catch {
      toast.error('予約に失敗しました')
    } finally {
      setScheduling(null)
    }
  }

  async function handleCancelSchedule(postId: string) {
    setScheduling(postId)
    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        toast.error(data.error ?? '予約の取消に失敗しました')
        return
      }
      toast.success('予約を取り消しました')
      setPosts(prev => prev.map(p =>
        p.id === postId ? { ...p, status: 'draft', scheduled_at: null } : p,
      ))
    } catch {
      toast.error('予約の取消に失敗しました')
    } finally {
      setScheduling(null)
    }
  }

  async function handleDelete(postId: string) {
    const ok = await confirm({
      title: '投稿を削除',
      message: 'この投稿を削除しますか？この操作は取り消せません。',
      confirmLabel: '削除する',
      destructive: true,
    })
    if (!ok) return
    setDeleting(postId)
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('削除に失敗しました')
        return
      }
      setPosts(prev => prev.filter(p => p.id !== postId))
    } finally {
      setDeleting(null)
    }
  }

  const filtered = (() => {
    const base = filter === 'all' || filter === 'video'
      ? posts
      : posts.filter(p => p.status === filter)
    // 予約タブは「投稿予定が近い順」に並べる（作成日時順だと次に何がいつ出るか分かりにくい）
    if (filter === 'scheduled') {
      return [...base].sort(
        (a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
      )
    }
    return base
  })()

  const counts = {
    all:       posts.length,
    draft:     posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    posted:    posts.filter(p => p.status === 'posted').length,
    failed:    posts.filter(p => p.status === 'failed').length,
    video:     videos.length,
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
            下書き一覧
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">生成した投稿・動画の管理</p>
        </div>
        <button
          onClick={() => load()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-600 transition-colors"
        >
          <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
          更新
        </button>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
        {(['all', 'draft', 'scheduled', 'posted', 'failed', 'video'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              'flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all',
              filter === f
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {f === 'all' ? 'すべて' : f === 'video' ? '動画' : STATUS_CONFIG[f].label}
            <span className={cx(
              'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]',
              filter === f ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-500',
            )}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00A3BF] border-t-transparent" />
        </div>
      ) : filter === 'video' ? (
        videos.length === 0 ? (
          <Card className="py-14 text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
              <VideoIcon className="h-5 w-5 text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-500">動画がまだありません</p>
            <p className="mt-0.5 text-xs text-gray-500">「動画投稿」から作成してください</p>
            <Button onClick={() => router.push('/dashboard/videos/new')} className="mt-4 gap-1.5">
              <Plus className="h-4 w-4" />
              動画を作成する
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {videos.map(v => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <Card className="py-14 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100">
            <FileText className="h-5 w-5 text-gray-500" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {filter === 'all' ? '投稿がありません' : `${STATUS_CONFIG[filter].label}の投稿がありません`}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">「投稿生成」から作成してください</p>
          <Button onClick={() => router.push('/dashboard/generate')} className="mt-4">
            投稿を生成する
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(post => (
            <DraftCard
              key={post.id}
              post={post}
              accounts={accounts}
              onPublish={handlePublish}
              onSchedule={handleSchedule}
              onCancelSchedule={handleCancelSchedule}
              onDelete={handleDelete}
              publishing={publishing === post.id}
              scheduling={scheduling === post.id}
              deleting={deleting === post.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
