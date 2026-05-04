import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { toFile } from 'openai'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { imageUrl, editPrompt } = await req.json() as {
      imageUrl?: string
      editPrompt?: string
    }

    if (!imageUrl || !editPrompt?.trim()) {
      return NextResponse.json({ error: 'imageUrl と editPrompt が必要です' }, { status: 400 })
    }

    // 元画像をダウンロード
    const imgRes = await fetch(imageUrl)
    if (!imgRes.ok) throw new Error('元画像の取得に失敗しました')
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer())

    // OpenAI images.edit で修正
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (client.images.edit as (p: any) => Promise<{ data: Array<{ b64_json?: string }> }>)({
      model: 'gpt-image-2',
      image: await toFile(imgBuffer, 'image.webp', { type: 'image/webp' }),
      prompt: editPrompt.trim(),
      n: 1,
      size: '1024x1024',
      quality: 'medium',
      output_format: 'webp',
    })

    const b64 = response.data[0]?.b64_json
    if (!b64) throw new Error('編集後の画像データが取得できませんでした')

    // Supabase Storage に保存
    const storage = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const fileName = `generated/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
    const { error: uploadError } = await storage.storage
      .from('post-images')
      .upload(fileName, Buffer.from(b64, 'base64'), { contentType: 'image/webp', upsert: false })

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const { data: { publicUrl } } = storage.storage
      .from('post-images')
      .getPublicUrl(fileName)

    return NextResponse.json({ imageUrl: publicUrl })
  } catch (e) {
    const message = e instanceof Error ? e.message : '画像編集に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
