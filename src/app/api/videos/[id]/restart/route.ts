import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { restartFailedVideo } from '@/lib/video/pipeline'
import { enqueueVideoPipeline } from '@/lib/video/jobs'
import { videoCapability } from '@/lib/runtime-env'

/**
 * failed 状態の動画を再開する。draft に戻して pipeline を再投入。
 * 既存の scenes / image_url / audio_url は残るため、未完了の step のみ再走する。
 *
 * failed に加えて、generating_* / rendering のまま固まった（stuck）動画も再開対象。
 * restartFailedVideo が failed→draft の CAS に失敗した場合は recoverStuckVideo で
 * 「閾値(30分)以上経過した stuck 行」だけを draft に戻す（正常進行中には触れない）。
 */
// 再開を許可するステータス（failed + 生成中で固まりうるもの）。
// 正常進行中(<30分)の stuck は restartFailedVideo 側で弾かれ 409 を返す。
const RESTARTABLE_STATUSES = [
  'failed',
  'generating_script',
  'generating_images',
  'generating_voice',
  'rendering',
]
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    // 所有者検証
    const { data: video, error: lookupErr } = await supabase
      .from('videos')
      .select('id, status, title, generation_mode')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (!video) return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })
    if (!RESTARTABLE_STATUSES.includes(video.status)) {
      return NextResponse.json({ error: 'failed または生成が停止した動画のみ再開できます' }, { status: 400 })
    }

    // 実行環境の判定はモードに依存する（HeyGen はクラウドレンダで Vercel 可、
    // Remotion は Chromium が必要でローカル限定）。所有者検証後にモードを見て判定する。
    const capability = videoCapability(video.generation_mode ?? undefined)
    if (!capability.enabled) {
      return NextResponse.json(
        { error: capability.message, code: 'LOCAL_ONLY' },
        { status: 503 },
      )
    }

    const acquired = await restartFailedVideo(id)
    if (!acquired) {
      // 別リクエストが既に restart 中。重複 enqueue を避ける。
      return NextResponse.json(
        { error: '既に再開処理が走っています。少し待ってから一覧をリロードしてください', code: 'ALREADY_RESTARTING' },
        { status: 409 },
      )
    }

    // pipeline 再投入（fire-and-forget）
    void enqueueVideoPipeline(id, {
      theme: video.title ?? null,
      sceneCount: null,
      targetDurationSec: null,
    }).catch(err => {
      console.error('[videos/restart] enqueue failed', id, err instanceof Error ? err.message : 'unknown')
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[videos/restart]', id, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '再開に失敗しました' }, { status: 500 })
  }
}
