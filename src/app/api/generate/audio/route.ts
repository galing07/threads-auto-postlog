import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { generateSpeech } from '@/lib/ai/elevenlabs'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { text, voiceId } = await req.json() as {
      text?: string
      voiceId?: string
    }

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text は必須です' }, { status: 400 })
    }

    const audioBuffer = await generateSpeech({ text: text.trim(), voiceId })

    const storage = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const fileName = `audio/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`
    const { error: uploadError } = await storage.storage
      .from('post-videos')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: false })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    const { data: { publicUrl } } = storage.storage
      .from('post-videos')
      .getPublicUrl(fileName)

    return NextResponse.json({ audioUrl: publicUrl })
  } catch (e) {
    const message = e instanceof Error ? e.message : '音声生成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
