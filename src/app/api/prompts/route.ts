import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import {
  DEFAULT_TEXT_PROMPT_TEMPLATE,
  DEFAULT_IMAGE_PROMPT_TEMPLATE,
  DEFAULT_THEMES_PROMPT_TEMPLATE,
} from '@/lib/ai/prompt-presets'

const MAX_LEN = 8_000

const PROMPT_COLUMNS = 'account_id, text_prompt, image_prompt, themes_prompt, updated_at'

interface PromptResponse {
  account_id: string
  text_prompt: string | null
  image_prompt: string | null
  themes_prompt: string | null
  text_default: string
  image_default: string
  themes_default: string
  updated_at: string | null
}

/** 取得行（Supabase クライアントは未型付けのため明示的に最小型へ落とす） */
interface PromptRowLike {
  text_prompt?: string | null
  image_prompt?: string | null
  themes_prompt?: string | null
  updated_at?: string | null
}

function asRow(data: unknown): PromptRowLike | null {
  if (!data || typeof data !== 'object') return null
  return data as PromptRowLike
}

function toResponse(
  accountId: string,
  text: string | null,
  image: string | null,
  themes: string | null,
  updatedAt: string | null,
): PromptResponse {
  return {
    account_id: accountId,
    text_prompt: text,
    image_prompt: image,
    themes_prompt: themes,
    text_default: DEFAULT_TEXT_PROMPT_TEMPLATE,
    image_default: DEFAULT_IMAGE_PROMPT_TEMPLATE,
    themes_default: DEFAULT_THEMES_PROMPT_TEMPLATE,
    updated_at: updatedAt,
  }
}

async function assertOwnsAccount(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  accountId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('accounts')
    .select('id')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const accountId = new URL(req.url).searchParams.get('accountId')
    if (!accountId) {
      return NextResponse.json({ error: 'accountId が必要です' }, { status: 400 })
    }

    if (!(await assertOwnsAccount(supabase, user.id, accountId))) {
      return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('account_prompt_settings')
      .select(PROMPT_COLUMNS)
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) throw error

    const row = asRow(data)
    return NextResponse.json(
      toResponse(
        accountId,
        row?.text_prompt ?? null,
        row?.image_prompt ?? null,
        row?.themes_prompt ?? null,
        row?.updated_at ?? null,
      ),
    )
  } catch (e) {
    console.error('[prompts GET]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

/** 「キーが存在しない＝この列は変更しない」ことを表すセンチネル */
const KEEP = Symbol('keep')

/**
 * 入力値を保存用に正規化する。
 * - undefined（キー無し）→ KEEP（呼び出し側で既存値を維持）
 * - string → trim 後 8000 字に切り詰め。空文字なら null（＝デフォルトに戻す）
 * - その他（null 含む）→ null（＝デフォルトに戻す）
 */
function normalize(v: unknown): string | null | typeof KEEP {
  if (v === undefined) return KEEP
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_LEN)
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      accountId?: unknown
      textPrompt?: unknown
      imagePrompt?: unknown
      themesPrompt?: unknown
    }

    const accountId = body.accountId
    if (!accountId || typeof accountId !== 'string') {
      return NextResponse.json({ error: 'accountId が必要です' }, { status: 400 })
    }

    if (!(await assertOwnsAccount(supabase, user.id, accountId))) {
      return NextResponse.json({ error: 'アカウントが見つかりません' }, { status: 404 })
    }

    // 部分更新を壊さないため既存行を先に取得し、KEEP のキーは既存値を維持する
    const { data: existingData, error: fetchError } = await supabase
      .from('account_prompt_settings')
      .select(PROMPT_COLUMNS)
      .eq('account_id', accountId)
      .maybeSingle()

    if (fetchError) throw fetchError

    const existing = asRow(existingData)

    const nextText = normalize(body.textPrompt)
    const nextImage = normalize(body.imagePrompt)
    const nextThemes = normalize(body.themesPrompt)

    const finalText = nextText === KEEP ? (existing?.text_prompt ?? null) : nextText
    const finalImage = nextImage === KEEP ? (existing?.image_prompt ?? null) : nextImage
    const finalThemes = nextThemes === KEEP ? (existing?.themes_prompt ?? null) : nextThemes
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('account_prompt_settings')
      .upsert(
        {
          account_id: accountId,
          text_prompt: finalText,
          image_prompt: finalImage,
          themes_prompt: finalThemes,
          updated_at: nowIso,
        },
        { onConflict: 'account_id' },
      )
      .select(PROMPT_COLUMNS)
      .single()

    if (error) throw error

    const row = asRow(data)
    return NextResponse.json(
      toResponse(
        accountId,
        row?.text_prompt ?? finalText,
        row?.image_prompt ?? finalImage,
        row?.themes_prompt ?? finalThemes,
        row?.updated_at ?? nowIso,
      ),
    )
  } catch (e) {
    console.error('[prompts PUT]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 })
  }
}
