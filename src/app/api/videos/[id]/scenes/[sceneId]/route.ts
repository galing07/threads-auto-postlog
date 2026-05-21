import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  updateSceneTexts,
  regenerateSceneImage,
  regenerateSceneAudio,
} from '@/lib/video/pipeline'

/**
 * シーンの本文 (キャプション / ナレーション / 画像プロンプト) 編集 API。
 * - narration_text を変えた場合: 自動で audio を再生成
 * - image_prompt を変えた場合: 自動で image を再生成
 * - caption_text のみ変更: 何も再生成しない（Remotion レンダー時に反映）
 *
 * いずれの場合も final_video_url は無効化される → 公開前に再レンダー必須。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> },
) {
  const { id, sceneId } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    // 所有者検証 (IDOR 防御): scene → video → user_id
    const { data: scene, error: lookupErr } = await supabase
      .from('scenes')
      .select('id, video_id, video:videos!inner(user_id)')
      .eq('id', sceneId)
      .eq('video_id', id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (!scene) return NextResponse.json({ error: 'シーンが見つかりません' }, { status: 404 })

    type VideoRef = { user_id: string } | { user_id: string }[] | null
    const videoUserId = (() => {
      const v = scene.video as VideoRef
      if (!v) return null
      if (Array.isArray(v)) return v[0]?.user_id ?? null
      return v.user_id
    })()
    if (videoUserId !== user.id) {
      return NextResponse.json({ error: 'シーンが見つかりません' }, { status: 404 })
    }

    const body = await req.json() as {
      caption_text?: unknown
      narration_text?: unknown
      image_prompt?: unknown
    }
    const patch: { caption_text?: string; narration_text?: string; image_prompt?: string } = {}
    if (typeof body.caption_text === 'string') patch.caption_text = body.caption_text
    if (typeof body.narration_text === 'string') patch.narration_text = body.narration_text
    if (typeof body.image_prompt === 'string') patch.image_prompt = body.image_prompt
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
    }

    const { narrationChanged, imageChanged } = await updateSceneTexts(sceneId, patch)

    // テキストに合わせて関連メディアを再生成（fire-and-forget）
    if (narrationChanged) {
      void regenerateSceneAudio(sceneId).catch(err => {
        console.error('[scenes PATCH] audio regen failed', sceneId, err instanceof Error ? err.message : 'unknown')
      })
    }
    if (imageChanged) {
      void regenerateSceneImage(sceneId).catch(err => {
        console.error('[scenes PATCH] image regen failed', sceneId, err instanceof Error ? err.message : 'unknown')
      })
    }

    return NextResponse.json({
      ok: true,
      narrationChanged,
      imageChanged,
    })
  } catch (e) {
    console.error('[scenes PATCH]', id, sceneId, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}
