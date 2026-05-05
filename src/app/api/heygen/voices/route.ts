import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { listVoices } from '@/lib/ai/heygen'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const language = req.nextUrl.searchParams.get('language') ?? 'Japanese'
    const voices = await listVoices(language)

    // UI用に必要なフィールドだけ返す
    const slim = voices.map(v => ({
      voice_id: v.voice_id,
      name: v.name,
      gender: v.gender,
      language: v.language,
      preview_audio: v.preview_audio,
    }))

    return NextResponse.json({ voices: slim })
  } catch (e) {
    console.error('[heygen/voices]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '音声一覧の取得に失敗しました' }, { status: 500 })
  }
}
