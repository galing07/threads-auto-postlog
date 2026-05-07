const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

// 日本語対応の汎用ボイス（ユーザーが未指定の場合のデフォルト）
// ElevenLabs multilingual v2 は日本語テキストをそのまま読める
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam (multilingual)

interface GenerateSpeechOptions {
  text: string
  voiceId?: string
}

export async function generateSpeech({ text, voiceId }: GenerateSpeechOptions): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured')

  const vid = voiceId || DEFAULT_VOICE_ID

  const res = await fetch(`${ELEVENLABS_API_URL}/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5', // 多言語対応・高速
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ElevenLabs error ${res.status}: ${err}`)
  }

  return Buffer.from(await res.arrayBuffer())
}
