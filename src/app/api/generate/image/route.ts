import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateDiagramImage } from '@/lib/ai/image'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { prompt, style } = await req.json() as { prompt: string; style?: 'diagram' | 'infographic' | 'minimal' }
    if (!prompt) {
      return NextResponse.json({ error: 'prompt は必須です' }, { status: 400 })
    }

    const imageUrl = await generateDiagramImage({ prompt, style })

    return NextResponse.json({ imageUrl })
  } catch (e) {
    const message = e instanceof Error ? e.message : '画像生成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
