// 引き継ぎデータのエクスポート (GET /api/handoff/export?includeKeys=0|1)
//
// ログイン中ユーザーの「プロンプト設定 / 下書き・予約 / (任意)APIキー」を JSON で返す。
// アクセストークン等のSNS連携機密は移行できない（環境鍵・OAuthアプリ依存）ため対象外。
// includeKeys=1 のときのみ user_api_keys を復号して平文で含める（機密・取扱注意）。

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { decryptSecret } from '@/lib/crypto'
import {
  HANDOFF_VERSION, HANDOFF_KEY_COLUMNS,
  type HandoffFile, type HandoffPrompt, type HandoffPost, type HandoffKeyColumn,
} from '@/lib/handoff'
import type { Account } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    // 機密を含むダウンロードなので、セッション奪取時の連続流出を抑える（20回/時）
    const rl = await checkRateLimit(user.id, 'handoff-export', 20, 3600, 'open')
    if (!rl.ok) {
      return NextResponse.json({ error: 'エクスポート回数が多すぎます。しばらくしてからお試しください。' }, { status: 429 })
    }

    const includeKeys = new URL(req.url).searchParams.get('includeKeys') === '1'
    // 監査: APIキーを平文で書き出した事実を残す（鍵そのものはログしない）
    if (includeKeys) {
      console.warn('[handoff/export] api keys exported', JSON.stringify({ userId: user.id, at: new Date().toISOString() }))
    }

    // 自分のアカウント一覧（id → 表示名/プラットフォーム のマップ用）
    const { data: accRows } = await supabase
      .from('accounts')
      .select('id, name, platform')
      .eq('user_id', user.id)
    const accounts = (accRows ?? []) as Pick<Account, 'id' | 'name' | 'platform'>[]
    const accById = new Map(accounts.map(a => [a.id, a]))
    const accountIds = accounts.map(a => a.id)

    // プロンプト設定（account_id 単位）
    const prompts: HandoffPrompt[] = []
    if (accountIds.length > 0) {
      const { data: promptRows } = await supabase
        .from('account_prompt_settings')
        .select('account_id, text_prompt, image_prompt, themes_prompt')
        .in('account_id', accountIds)
      for (const r of (promptRows ?? []) as Array<{ account_id: string; text_prompt: string | null; image_prompt: string | null; themes_prompt: string | null }>) {
        const acc = accById.get(r.account_id)
        if (!acc) continue
        // 全列 null（実質未設定）はスキップ
        if (!r.text_prompt && !r.image_prompt && !r.themes_prompt) continue
        prompts.push({
          accountName: acc.name,
          platform: acc.platform,
          textPrompt: r.text_prompt,
          imagePrompt: r.image_prompt,
          themesPrompt: r.themes_prompt,
        })
      }
    }

    // 下書き・予約投稿
    const { data: postRows } = await supabase
      .from('posts')
      .select('account_id, text_content, image_url, theme, summary, status')
      .eq('user_id', user.id)
      .in('status', ['draft', 'scheduled'])
    const posts: HandoffPost[] = ((postRows ?? []) as Array<{ account_id: string | null; text_content: string | null; image_url: string | null; theme: string | null; summary: string | null }>).map(r => {
      const acc = r.account_id ? accById.get(r.account_id) : undefined
      return {
        accountName: acc?.name ?? null,
        platform: acc?.platform ?? null,
        textContent: r.text_content,
        imageUrl: r.image_url,
        theme: r.theme,
        summary: r.summary,
      }
    })

    // APIキー（任意・復号して平文）
    let apiKeys: Partial<Record<HandoffKeyColumn, string>> | undefined
    if (includeKeys) {
      const { data: keyRow } = await supabase
        .from('user_api_keys')
        .select(HANDOFF_KEY_COLUMNS.join(', '))
        .eq('user_id', user.id)
        .maybeSingle()
      if (keyRow) {
        const row = keyRow as unknown as Record<string, string | null>
        const out: Partial<Record<HandoffKeyColumn, string>> = {}
        for (const col of HANDOFF_KEY_COLUMNS) {
          const enc = row[col]
          const plain = decryptSecret(enc ?? null)?.trim()
          if (plain) out[col] = plain
        }
        if (Object.keys(out).length > 0) apiKeys = out
      }
    }

    const payload: HandoffFile = {
      version: HANDOFF_VERSION,
      exportedAt: new Date().toISOString(),
      includesSecrets: includeKeys,
      prompts,
      posts,
      apiKeys,
    }
    return NextResponse.json(payload)
  } catch (e) {
    console.error('[handoff/export]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'エクスポートに失敗しました' }, { status: 500 })
  }
}
