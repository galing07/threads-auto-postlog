// 引き継ぎデータのインポート (POST /api/handoff/import)
//
// エクスポートした JSON を取り込む。新環境ではアカウントIDが変わるため、プロンプト/下書きは
// 「platform + アカウント表示名」で既存の連携済みアカウントに再マッチングする。
// 安全のため予約投稿は status='draft' として取り込む（取り込み直後の意図しない自動投稿を防止）。

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { encryptSecret } from '@/lib/crypto'
import {
  HANDOFF_VERSION, HANDOFF_KEY_COLUMNS,
  HANDOFF_MAX_PROMPTS, HANDOFF_MAX_POSTS, HANDOFF_MAX_PROMPT_LEN, HANDOFF_MAX_TEXT_LEN,
  accountMatchKey,
  type HandoffFile, type HandoffImportResult, type HandoffKeyColumn,
} from '@/lib/handoff'
import type { Account } from '@/types/database'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function clip(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json().catch(() => null) as HandoffFile | null
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'ファイルの形式が不正です' }, { status: 400 })
    }
    if (body.version !== HANDOFF_VERSION) {
      return NextResponse.json({ error: `対応していないファイル形式です（version=${String(body.version).slice(0, 20)}）` }, { status: 400 })
    }

    // 連携済みアカウント: platform+表示名 → id
    const { data: accRows } = await supabase
      .from('accounts')
      .select('id, name, platform')
      .eq('user_id', user.id)
    const accounts = (accRows ?? []) as Pick<Account, 'id' | 'name' | 'platform'>[]
    const accByKey = new Map(accounts.map(a => [accountMatchKey(a.platform, a.name), a.id]))

    const result: HandoffImportResult = {
      apiKeysImported: 0,
      prompts: { imported: 0, skipped: 0 },
      posts: { imported: 0 },
      unmatchedAccounts: [],
    }
    const unmatched = new Set<string>()

    // 1) APIキー（暗号化して upsert）
    if (body.apiKeys && typeof body.apiKeys === 'object') {
      const update: Record<string, string> = {}
      for (const col of HANDOFF_KEY_COLUMNS) {
        const v = (body.apiKeys as Partial<Record<HandoffKeyColumn, unknown>>)[col]
        const plain = clip(v, 4000)
        if (plain) update[col] = encryptSecret(plain)
      }
      if (Object.keys(update).length > 0) {
        const { error } = await supabase
          .from('user_api_keys')
          .upsert({ user_id: user.id, ...update, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        if (error) throw error
        result.apiKeysImported = Object.keys(update).length
      }
    }

    // 2) プロンプト設定（platform+表示名でアカウントに紐づけ → account_id 単位で upsert）
    const prompts = Array.isArray(body.prompts) ? body.prompts.slice(0, HANDOFF_MAX_PROMPTS) : []
    for (const p of prompts) {
      const accId = accByKey.get(accountMatchKey(p?.platform, p?.accountName))
      if (!accId) {
        result.prompts.skipped += 1
        if (p?.accountName) unmatched.add(`${p.platform ?? '?'} / ${p.accountName}`)
        continue
      }
      const { error } = await supabase
        .from('account_prompt_settings')
        .upsert({
          account_id: accId,
          text_prompt: clip(p.textPrompt, HANDOFF_MAX_PROMPT_LEN),
          image_prompt: clip(p.imagePrompt, HANDOFF_MAX_PROMPT_LEN),
          themes_prompt: clip(p.themesPrompt, HANDOFF_MAX_PROMPT_LEN),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'account_id' })
      if (error) throw error
      result.prompts.imported += 1
    }

    // 3) 下書き・予約 → すべて status='draft' で取り込み（自動投稿の暴発を防止）
    const posts = Array.isArray(body.posts) ? body.posts.slice(0, HANDOFF_MAX_POSTS) : []
    const rowsToInsert = posts
      .map(p => {
        const text = clip(p?.textContent, HANDOFF_MAX_TEXT_LEN)
        if (!text) return null // 本文が空の投稿は取り込まない
        const accId = p?.accountName ? accByKey.get(accountMatchKey(p.platform, p.accountName)) ?? null : null
        if (p?.accountName && !accId) unmatched.add(`${p.platform ?? '?'} / ${p.accountName}`)
        return {
          user_id: user.id,
          account_id: accId,
          text_content: text,
          image_url: clip(p?.imageUrl, 2000),
          theme: clip(p?.theme, 500),
          summary: clip(p?.summary, 2000),
          status: 'draft' as const,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from('posts').insert(rowsToInsert)
      if (error) throw error
      result.posts.imported = rowsToInsert.length
    }

    result.unmatchedAccounts = [...unmatched]
    return NextResponse.json(result)
  } catch (e) {
    console.error('[handoff/import]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'インポートに失敗しました' }, { status: 500 })
  }
}
