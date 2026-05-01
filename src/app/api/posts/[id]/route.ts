import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as { status?: string; scheduledAt?: string | null }

    const { data, error } = await supabase
      .from('posts')
      .update({
        ...(body.status && { status: body.status }),
        ...('scheduledAt' in body && { scheduled_at: body.scheduledAt }),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : '更新に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
