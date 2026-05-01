import Anthropic from '@anthropic-ai/sdk'
import type { Account } from '@/types/database'

interface GenerateTextOptions {
  account: Account
  theme: string
  maxLength?: number
}

interface GeneratedText {
  content: string
  imagePrompt: string
}

export async function generateThreadsText({
  account,
  theme,
  maxLength = 500,
}: GenerateTextOptions): Promise<GeneratedText> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const persona = account.persona ?? '転職ノウハウ発信者'
  const tone = account.tone ?? 'friendly'
  const audience = account.target_audience ?? 'キャリアに不安のある高卒20代'
  const topics = account.post_topics?.join('、') ?? '転職、キャリア、仕事'

  const toneGuide: Record<string, string> = {
    friendly: 'フランクで親しみやすく、友達に話しかけるような口調',
    professional: '専門的で信頼感があり、プロとしての視点から語る口調',
    personal: '自分の体験談を語るような、等身大の共感しやすい口調',
  }

  const systemPrompt = `あなたは${persona}として、Threadsに投稿するコンテンツを作成するプロのSNSライターです。

【ペルソナ】${persona}
【ターゲット】${audience}
【発信テーマ】${topics}
【文体】${toneGuide[tone] ?? toneGuide.friendly}

【Threads投稿のルール】
- ${maxLength}文字以内
- 読みやすい改行・空白を使う
- 最後に行動を促す一言か共感を生む問いかけを入れる
- ハッシュタグは3〜5個、最後にまとめて
- 絵文字を適度に使って読みやすくする
- 転職希望者の悩みや不安に寄り添う内容にする`

  const userPrompt = `以下のテーマでThreads投稿文を1つ作成してください。

テーマ：${theme}

また、この投稿に合う図解画像のプロンプト（英語・DALL-E用）も生成してください。

必ず以下のJSON形式で返してください：
{
  "content": "投稿本文（改行含む）",
  "imagePrompt": "DALL-E向け英語プロンプト（図解・インフォグラフィック風）"
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI応答のパースに失敗しました')

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedText
  return parsed
}
