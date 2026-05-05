import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Meta/Threads アンインストール Webhook
 * - ユーザーがThreads側でアプリ連携を解除した時に呼ばれる
 * - signed_request を検証して、対応するアカウントを is_active=false に
 *
 * Meta仕様:
 *  POST application/x-www-form-urlencoded
 *  body: signed_request=<base64.signature>
 *  return 200 OK
 *
 * 参考: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

interface ParsedSignedRequest {
  user_id?: string
  algorithm?: string
  issued_at?: number
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64')
}

function parseSignedRequest(signedRequest: string, secret: string): ParsedSignedRequest | null {
  const [encodedSig, payload] = signedRequest.split('.', 2)
  if (!encodedSig || !payload) return null

  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest()
  const sig = base64UrlDecode(encodedSig)

  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null
  }

  try {
    return JSON.parse(base64UrlDecode(payload).toString('utf8')) as ParsedSignedRequest
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const signedRequest = formData.get('signed_request')
    if (typeof signedRequest !== 'string') {
      return NextResponse.json({ ok: false, error: 'missing signed_request' }, { status: 400 })
    }

    // 該当ユーザーの client_secret を特定するためにサービスロールで全アカウント検索
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: accounts } = await admin
      .from('accounts')
      .select('id, threads_user_id, threads_client_secret')
      .not('threads_client_secret', 'is', null)

    let matchedAccountId: string | null = null
    let matchedThreadsUserId: string | null = null

    for (const acc of accounts ?? []) {
      if (!acc.threads_client_secret) continue
      const parsed = parseSignedRequest(signedRequest, acc.threads_client_secret)
      if (parsed?.user_id) {
        if (acc.threads_user_id === parsed.user_id) {
          matchedAccountId = acc.id
          matchedThreadsUserId = parsed.user_id
          break
        }
      }
    }

    if (matchedAccountId) {
      await admin
        .from('accounts')
        .update({ is_active: false, access_token: null, token_expires_at: null })
        .eq('id', matchedAccountId)
      console.info('[threads/uninstall] disabled account', { matchedAccountId, threadsUserId: matchedThreadsUserId })
    } else {
      console.warn('[threads/uninstall] no matching account for signed_request')
    }

    // Metaは200 OKを期待する（中身は問わず）
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[threads/uninstall]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// Metaの初期検証で GET を投げてくる場合があるので200で受ける
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'threads-uninstall-callback' })
}
