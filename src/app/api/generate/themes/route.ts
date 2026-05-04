import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Account } from '@/types/database'

const DEMO_ACCOUNT: Pick<Account, 'persona' | 'tone' | 'target_audience' | 'post_topics'> = {
  persona: '転職ノウハウ発信者',
  tone: 'friendly',
  target_audience: 'キャリアに不安のある高卒20代',
  post_topics: ['転職ノウハウ', 'キャリア相談', '仕事の悩み'],
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { accountId } = await req.json() as { accountId?: string }

    let account = DEMO_ACCOUNT
    if (accountId) {
      const { data } = await supabase
        .from('accounts')
        .select('persona, tone, target_audience, post_topics')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single()
      if (data) account = data
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured')

    const topics = account.post_topics?.join('、') ?? '転職、キャリア'
    const audience = account.target_audience ?? '20代社会人'
    const persona = account.persona ?? '転職アドバイザー'

    const prompt = `${persona}として、${audience}向けのThreads投稿テーマを6個考えてください。
テーマ一覧：${topics}

条件：
- 具体的で検索・共感されやすいタイトル
- バズ型・共感型・数字型・体験談型・問いかけ型をバランスよく混ぜる
- 各テーマは20〜40文字程度
- 必ずJSON配列で返す

返答形式（他の文章は不要）：
["テーマ1", "テーマ2", "テーマ3", "テーマ4", "テーマ5", "テーマ6"]`

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? '',
        'X-Title': 'Threads Auto Post',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const json = await res.json() as { choices: Array<{ message: { content: string } }> }
    const text = json.choices[0]?.message?.content ?? '[]'

    const match = text.match(/\[[\s\S]*\]/)
    const themes = match ? JSON.parse(match[0]) as string[] : []

    return NextResponse.json({ themes })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'テーマ生成に失敗しました'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
