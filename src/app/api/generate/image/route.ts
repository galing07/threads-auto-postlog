import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { generateDiagramImage } from '@/lib/ai/image'

function autoImagePrompt(postContent: string): string {
  const excerpt = postContent.slice(0, 100).replace(/[#\n🎉✅❌💡]/g, ' ').trim()
  return `Clean infographic diagram about: "${excerpt}". Japanese career and job change topic. Flat design, simple icons, light background, no text, professional style.`
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { prompt, postContent, style } = await req.json() as {
      prompt?: string
      postContent?: string
      style?: 'diagram' | 'infographic' | 'minimal'
    }

    const resolvedPrompt = prompt ?? (postContent ? autoImagePrompt(postContent) : null)
    if (!resolvedPrompt) {
      return NextResponse.json({ error: 'prompt か postContent が必要です' }, { status: 400 })
    }

    const imageUrl = await generateDiagramImage({ prompt: resolvedPrompt, style })
    return NextResponse.json({ imageUrl })
  } catch (e) {
    const message = e instanceof Error ? e.message : '画像生成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
