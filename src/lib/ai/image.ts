import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

interface GenerateImageOptions {
  prompt: string
  style?: 'diagram' | 'infographic' | 'minimal'
}

export async function generateDiagramImage({
  prompt,
  style = 'diagram',
}: GenerateImageOptions): Promise<string> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const styleGuide: Record<string, string> = {
    diagram:     'Clean diagram infographic, flat design, white background, Japanese career advice, minimal icons, pastel colors, professional layout',
    infographic: 'Modern infographic, clean typography, data visualization, career tips, blue and white color scheme, professional',
    minimal:     'Minimal clean design, simple illustration, white background, career and job hunting theme, soft colors',
  }

  const fullPrompt = `${styleGuide[style]}, ${prompt}. No text in Japanese, use simple English labels or numbers only. High quality, suitable for social media.`

  // gpt-image-2 は response_format 非対応。デフォルトで b64_json を返す
  const response = await client.images.generate({
    model: 'gpt-image-2',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'medium',
  })

  const item = response.data?.[0]
  if (!item) throw new Error('画像生成に失敗しました')

  // URL だけ返ってきた場合はそのまま返す（一時URLだが投稿時に使用可能）
  if (!item.b64_json && item.url) return item.url

  const b64 = item.b64_json
  if (!b64) throw new Error('画像データが取得できませんでした')

  // Supabase Storageに保存してパブリックURLを返す
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const fileName = `generated/${Date.now()}-${Math.random().toString(36).slice(2)}.png`
  const buffer = Buffer.from(b64, 'base64')

  const { error } = await supabase.storage
    .from('post-images')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('post-images')
    .getPublicUrl(fileName)

  return publicUrl
}
