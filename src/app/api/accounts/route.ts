import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchInstagramUserId } from '@/lib/platforms/instagram'

// 機密カラムは クライアントへ返さない（GET / POST レスポンス共通）
const PUBLIC_ACCOUNT_COLUMNS = [
  'id',
  'user_id',
  'platform',
  'name',
  'persona',
  'tone',
  'target_audience',
  'post_topics',
  'token_expires_at',
  'threads_user_id',
  'instagram_user_id',
  'is_active',
  'created_at',
  'updated_at',
].join(',')

const MAX_NAME = 100
const MAX_PERSONA = 200
const MAX_AUDIENCE = 200
const MAX_TOKEN = 4096
const MAX_USER_ID = 64
const MAX_CLIENT_ID = 100
const MAX_CLIENT_SECRET = 200
const MAX_TOPICS = 20
const MAX_TOPIC_LEN = 100

const SUPPORTED_PLATFORMS = ['threads', 'instagram'] as const
type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number]

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { data, error } = await supabase
      .from('accounts')
      .select(PUBLIC_ACCOUNT_COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[accounts GET]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '取得に失敗しました' }, { status: 500 })
  }
}

async function fetchThreadsUserId(accessToken: string): Promise<string> {
  const url = 'https://graph.threads.net/v1.0/me?fields=id'
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    // エラー本文はログにのみ残し、クライアントへは返さない（トークン漏洩対策）
    const errText = await res.text().catch(() => '')
    console.error('[Threads /me]', res.status, errText)
    throw new Error(`Threads API: ユーザーIDの取得に失敗しました (HTTP ${res.status})`)
  }
  const data = await res.json() as { id?: string }
  if (!data.id) throw new Error('Threads API: ユーザーIDが取得できませんでした')
  return data.id
}

interface CreateAccountBody {
  platform?: unknown
  name?: unknown
  persona?: unknown
  tone?: unknown
  targetAudience?: unknown
  postTopics?: unknown
  accessToken?: unknown
  threadsUserId?: unknown
  instagramUserId?: unknown
  clientId?: unknown
  clientSecret?: unknown
}

function sanitizeStr(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') return ''
  const trimmed = v.trim()
  return trimmed.slice(0, maxLen)
}

function isSupportedPlatform(p: unknown): p is SupportedPlatform {
  return typeof p === 'string' && (SUPPORTED_PLATFORMS as readonly string[]).includes(p)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as CreateAccountBody

    // platform 未指定はデフォルトで threads、指定されている場合は値を厳密にチェック
    let platform: SupportedPlatform
    if (body.platform === undefined || body.platform === null || body.platform === '') {
      platform = 'threads'
    } else if (isSupportedPlatform(body.platform)) {
      platform = body.platform
    } else {
      return NextResponse.json(
        { error: `サポートされていないプラットフォームです（threads / instagram のみ）` },
        { status: 400 },
      )
    }

    const name = sanitizeStr(body.name, MAX_NAME)
    const accessTokenRaw = typeof body.accessToken === 'string' ? body.accessToken.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'アカウント名は必須です' }, { status: 400 })
    }
    if (!accessTokenRaw) {
      return NextResponse.json({ error: 'Access Token は必須です' }, { status: 400 })
    }
    if (accessTokenRaw.length > MAX_TOKEN) {
      return NextResponse.json({ error: 'Access Token が長すぎます' }, { status: 400 })
    }

    const persona = sanitizeStr(body.persona, MAX_PERSONA)
    const tone = sanitizeStr(body.tone, 50) || 'friendly'
    const targetAudience = sanitizeStr(body.targetAudience, MAX_AUDIENCE)
    const clientId = sanitizeStr(body.clientId, MAX_CLIENT_ID) || null
    const clientSecret = sanitizeStr(body.clientSecret, MAX_CLIENT_SECRET) || null

    // post_topics: array | string | undefined
    let topicArray: string[]
    if (Array.isArray(body.postTopics)) {
      topicArray = body.postTopics.filter((s): s is string => typeof s === 'string')
    } else if (typeof body.postTopics === 'string') {
      topicArray = body.postTopics.split('、')
    } else {
      topicArray = []
    }
    const postTopics = topicArray
      .map(s => s.trim().slice(0, MAX_TOPIC_LEN))
      .filter(Boolean)
      .slice(0, MAX_TOPICS)

    // プラットフォーム別の user_id 解決
    let threadsUserId: string | null = null
    let instagramUserId: string | null = null

    if (platform === 'threads') {
      threadsUserId = sanitizeStr(body.threadsUserId, MAX_USER_ID)
      if (!threadsUserId) {
        try {
          threadsUserId = await fetchThreadsUserId(accessTokenRaw)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Threads APIエラー'
          return NextResponse.json({ error: msg }, { status: 400 })
        }
      }
    } else if (platform === 'instagram') {
      instagramUserId = sanitizeStr(body.instagramUserId, MAX_USER_ID)
      if (!instagramUserId) {
        try {
          instagramUserId = await fetchInstagramUserId(accessTokenRaw)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Instagram APIエラー'
          return NextResponse.json({ error: msg }, { status: 400 })
        }
      }
      // IG Business Account ID は数値文字列のみ
      if (instagramUserId && !/^\d+$/.test(instagramUserId)) {
        return NextResponse.json(
          { error: 'Instagram Business Account ID は数字のみ使用できます' },
          { status: 400 },
        )
      }
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        platform,
        name,
        persona,
        tone,
        target_audience: targetAudience,
        post_topics: postTopics,
        access_token: accessTokenRaw,
        threads_user_id: threadsUserId,
        threads_client_id: clientId,
        threads_client_secret: clientSecret,
        instagram_user_id: instagramUserId,
        is_active: true,
      })
      .select(PUBLIC_ACCOUNT_COLUMNS)
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    console.error('[accounts POST]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '作成に失敗しました' }, { status: 500 })
  }
}
