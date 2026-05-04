import OpenAI from 'openai'

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

  const response = await client.images.generate({
    model: 'gpt-image-2',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
  })

  const imageUrl = response.data?.[0]?.url
  if (!imageUrl) throw new Error('画像生成に失敗しました')

  return imageUrl
}
