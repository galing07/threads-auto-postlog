import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase-admin'

interface GenerateImageOptions {
  prompt: string
  style?: 'diagram' | 'infographic' | 'minimal'
}

// OpenAI SDK の型に厳密に依存しすぎず、必要な戻り値だけ拾う
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ImageGenerateFn = (p: any) => Promise<{
  data?: Array<{ b64_json?: string }>
}>

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504])

function isRetryableError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  // OpenAI SDK は APIError に status を載せている
  const status = (e as Error & { status?: number }).status
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status)
  return /\b(5\d{2}|429|408)\b/.test(e.message)
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (retries > 0 && isRetryableError(e)) {
      await new Promise(r => setTimeout(r, 2000))
      return callWithRetry(fn, retries - 1)
    }
    throw e
  }
}

export async function uploadGeneratedImage(
  b64: string,
  ext: string,
  contentType: string,
): Promise<string> {
  const supabase = createAdminClient()
  const fileName = `generated/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const buffer = Buffer.from(b64, 'base64')

  const { error } = await supabase.storage
    .from('post-images')
    .upload(fileName, buffer, { contentType, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage
    .from('post-images')
    .getPublicUrl(fileName)

  return publicUrl
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

  const fullPrompt = `${prompt} Style: ${styleGuide[style]}. High quality, 1:1 square format, suitable for social media.`

  const response = await callWithRetry(() =>
    (client.images.generate as ImageGenerateFn)({
      model: 'gpt-image-2',
      prompt: fullPrompt,
      n: 1,
      size: '1024x1024',
      quality: 'medium',
    })
  )

  const b64 = response.data?.[0]?.b64_json
  if (!b64) throw new Error('画像データが取得できませんでした')

  return uploadGeneratedImage(b64, 'png', 'image/png')
}
