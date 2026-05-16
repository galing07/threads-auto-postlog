import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { PostStatus } from '@/types/database'

// ユーザーが手動で遷移できる status のみ許可
const ALLOWED_PATCH_STATUSES = new Set<PostStatus>(['draft', 'failed'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as { status?: string }

    if (body.status && !ALLOWED_PATCH_STATUSES.has(body.status as PostStatus)) {
      return NextResponse.json({ error: '指定できない status です' }, { status: 400 })
    }

    // 所有者である post に対する update のみ許可（IDOR 防御）
    // accounts 経由所有のケースも許すため、まず lookup
    const { data: existing, error: lookupErr } = await supabase
      .from('posts')
      .select('id, user_id, account_id, account:accounts(user_id)')
      .eq('id', id)
      .single()

    if (lookupErr || !existing) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    type AccountRef = { user_id: string } | { user_id: string }[] | null
    const accountUserId = (() => {
      const acc = existing.account as AccountRef
      if (!acc) return null
      if (Array.isArray(acc)) return acc[0]?.user_id ?? null
      return acc.user_id
    })()

    const ownsPost =
      existing.user_id === user.id ||
      (accountUserId !== null && accountUserId === user.id)

    if (!ownsPost) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    const updates: { status?: string } = {}
    if (body.status) updates.status = body.status

    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[posts PATCH]', id, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data: existing } = await supabase
      .from('posts')
      .select('id, user_id, account_id, account:accounts(user_id)')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    type AccountRef = { user_id: string } | { user_id: string }[] | null
    const accountUserId = (() => {
      const acc = existing.account as AccountRef
      if (!acc) return null
      if (Array.isArray(acc)) return acc[0]?.user_id ?? null
      return acc.user_id
    })()

    const ownsPost =
      existing.user_id === user.id ||
      (accountUserId !== null && accountUserId === user.id)

    if (!ownsPost) {
      return NextResponse.json({ error: '投稿が見つかりません' }, { status: 404 })
    }

    const { error } = await supabase.from('posts').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[posts DELETE]', id, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
