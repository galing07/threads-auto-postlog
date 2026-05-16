import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import crypto from 'crypto'

/**
 * Meta/Threads データ削除リクエスト Webhook
 * - ユーザーがGDPR等でデータ削除を要求した時に呼ばれる
 * - signed_request を検証 → 該当アカウントと関連投稿を削除
 * - レスポンスとして { url, confirmation_code } を返す必要あり
 *   url: 削除ステータス確認ページのURL
 *   confirmation_code: ユニークID（ユーザーへの追跡用）
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
      return NextResponse.json({ error: 'missing signed_request' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: accounts } = await admin
      .from('accounts')
      .select('id, user_id, threads_user_id, threads_client_secret')
      .not('threads_client_secret', 'is', null)

    let matchedAccount: { id: string; user_id: string } | null = null

    for (const acc of accounts ?? []) {
      if (!acc.threads_client_secret) continue
      const parsed = parseSignedRequest(signedRequest, acc.threads_client_secret)
      if (parsed?.user_id && acc.threads_user_id === parsed.user_id) {
        matchedAccount = { id: acc.id, user_id: acc.user_id }
        break
      }
    }

    const confirmationCode = crypto.randomUUID()

    if (matchedAccount) {
      // posts は ON DELETE CASCADE が効いてるので account 削除でカスケード削除される想定
      await admin
        .from('accounts')
        .delete()
        .eq('id', matchedAccount.id)
      console.info('[threads/delete] deleted account', { accountId: matchedAccount.id, confirmationCode })
    } else {
      console.warn('[threads/delete] no matching account for signed_request', { confirmationCode })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://threads-auto-post-umber.vercel.app'

    return NextResponse.json({
      url: `${appUrl}/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    })
  } catch (e) {
    console.error('[threads/delete]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'threads-delete-callback' })
}
