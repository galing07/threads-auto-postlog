// 招待コード制の新規アカウント作成エンドポイント (POST /api/auth/signup)
//
// なぜサーバー側か:
//   招待コードをクライアントで判定すると JS バンドルに値が露出して突破される。
//   コードの検証・ユーザー作成は必ずサーバー側で行う。
//
// 認可: 正しい招待コード（INVITE_CODE 環境変数）を知っている人だけ登録可。
//   比較は SHA-256 ダイジェスト同士の timingSafeEqual で定数時間（タイミング攻撃対策）。
//
// ユーザー作成: service-role の admin.createUser を email_confirm:true で実行。
//   → メール確認フローを挟まず即ログイン可能にする（SMTP 未設定でも動く）。

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** SHA-256 ダイジェスト同士の定数時間比較（長さも値も漏らさない） */
function constantTimeEquals(a: string, b: string): boolean {
  const ah = crypto.createHash('sha256').update(a).digest()
  const bh = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ah, bh)
}

/** IP からレート制限用の決定的 UUID を作る（同一 IP を同じバケットに集約） */
function ipToUuid(ip: string): string {
  const h = crypto.createHash('sha256').update(ip).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export async function POST(req: NextRequest) {
  // 入力パース（不正 JSON を弾く）
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエストが不正です' }, { status: 400 })
  }

  const data = (body ?? {}) as Record<string, unknown>
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const password = typeof data.password === 'string' ? data.password : ''
  const inviteCode = typeof data.inviteCode === 'string' ? data.inviteCode : ''

  // バリデーション（境界で早期失敗）
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'メールアドレスの形式が正しくありません' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` },
      { status: 400 },
    )
  }
  if (!inviteCode) {
    return NextResponse.json({ error: '招待コードを入力してください' }, { status: 400 })
  }

  // サーバー設定ミス（招待コード未設定）は汎用メッセージで隠す
  const expected = process.env.INVITE_CODE
  if (!expected) {
    console.error(JSON.stringify({ evt: 'signup_missing_invite_env' }))
    return NextResponse.json({ error: '現在登録を受け付けていません' }, { status: 503 })
  }

  // IP ベースの簡易レート制限（招待コード総当たり対策）
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const rl = await checkRateLimit(ipToUuid(ip), 'signup', 10, 3600, 'open')
  if (!rl.ok) {
    return NextResponse.json(
      { error: '試行回数が多すぎます。しばらくしてから再度お試しください' },
      { status: 429 },
    )
  }

  // 招待コード照合（定数時間）
  if (!constantTimeEquals(inviteCode, expected)) {
    return NextResponse.json({ error: '招待コードが正しくありません' }, { status: 403 })
  }

  // ユーザー作成（メール確認不要で即ログイン可）
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    // 重複登録は利用者に伝える価値があるので個別ハンドリング、それ以外は汎用化
    const msg = error.message?.toLowerCase() ?? ''
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exist')) {
      return NextResponse.json(
        { error: 'このメールアドレスは既に登録されています' },
        { status: 409 },
      )
    }
    console.error(JSON.stringify({ evt: 'signup_create_user_error', msg: error.message }))
    return NextResponse.json({ error: 'アカウントの作成に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
