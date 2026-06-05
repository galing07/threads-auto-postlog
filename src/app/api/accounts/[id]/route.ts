import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

/**
 * SNS アカウント（Threads / Instagram / X のペルソナ）を削除する。
 *
 * RLS により user_id スコープで保護し、念のため WHERE 句にも user_id を入れて
 * 他人のアカウントを消せないようにする（多層防御）。
 *
 * 子テーブルの削除挙動（本番 DB の FK 定義に基づく）:
 *   - account_prompt_settings.account_id  → ON DELETE CASCADE（一緒に削除）
 *   - post_themes.account_id              → ON DELETE CASCADE（一緒に削除）
 *   - posts.account_id                    → ON DELETE CASCADE（投稿履歴も削除）
 *   - videos.account_id                   → ON DELETE SET NULL（動画は残り、紐付けのみ解除）
 * したがって accounts 行を1回 DELETE するだけで DB 側が連鎖処理する。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    // 削除対象が本人のものとして存在するか確認（404 と「権限なし」を区別せず一律 404）。
    const { data: target, error: lookupErr } = await supabase
      .from('accounts')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (lookupErr) throw lookupErr
    if (!target) {
      return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 })
    }

    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[accounts DELETE]', id, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
