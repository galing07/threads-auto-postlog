import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { listAvatars } from '@/lib/ai/heygen'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const avatars = await listAvatars()
    const slim = avatars.map(a => ({
      avatar_id: a.avatar_id,
      avatar_name: a.avatar_name,
      gender: a.gender,
      preview_image_url: a.preview_image_url,
      looks: a.looks?.map(l => ({
        look_id: l.look_id,
        preview_image_url: l.preview_image_url,
      })) ?? [],
    }))

    return NextResponse.json({ avatars: slim })
  } catch (e) {
    console.error('[heygen/avatars]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'アバター一覧の取得に失敗しました' }, { status: 500 })
  }
}
