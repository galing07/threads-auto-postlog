// Instagram OAuth 開始エンドポイント (GET /api/auth/instagram)
//
// 新方式「Business Login for Instagram」。Facebookページ不要。
// フロー:
//   1. ログイン中ユーザーを Supabase セッションから取得
//   2. CSRF 対策の state を生成 → HttpOnly Cookie に保存
//   3. Instagram 認可 URL にリダイレクト
//
// 資格情報の保存場所:
//   - Instagram アプリ ID / アプリシークレット: 環境変数ではなく「ユーザーごとにアプリ内 DB」に
//     保存する（設定/連携パネル → fetchInstagramAppCredentials）。マルチテナント前提のため。
//   - INSTAGRAM_REDIRECT_URI（任意）: 未設定なら NEXT_PUBLIC_APP_URL から自動生成。
//     Meta の「ビジネスログイン設定」に登録するリダイレクト URI と完全一致させること
//     （連携パネルに実値を表示しているのでそれをコピーする）。
//   - ENCRYPTION_KEY: access_token 暗号化に使う鍵（callback で使用）。

import 'server-only'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchInstagramAppCredentials } from '@/lib/ai/api-keys'
import { buildInstagramAuthorizeUrl } from '@/lib/platforms/instagram'

const INSTAGRAM_OAUTH_STATE_COOKIE = 'instagram_oauth_state'
const INSTAGRAM_OAUTH_STATE_MAX_AGE_SEC = 600 // 10 分

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://threads-auto-post-umber.vercel.app'
}

export function instagramRedirectUri(): string {
  return process.env.INSTAGRAM_REDIRECT_URI ?? `${appUrl()}/api/auth/instagram/callback`
}

function redirectToAccounts(reason: string): NextResponse {
  // ボタンは全画面遷移（<a>）なので、生JSONを見せず画面に戻してトースト表示させる
  const url = new URL('/dashboard/accounts', appUrl())
  url.searchParams.set('platform', 'instagram')
  url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', appUrl()))
  }

  // アプリID/シークレットは環境変数ではなくユーザーごとにアプリ内で保存（設定画面/連携パネル）。
  // callback ではトークン交換に appSecret が必須なので、開始時点で両方揃っているか確認する。
  // appId だけ確認していると、ユーザーが Instagram で「許可」した後に callback で
  // app_not_configured になり、無駄に認可だけ済んでしまう（P3）。
  const { appId: clientId, appSecret } = await fetchInstagramAppCredentials()
  if (!clientId || !appSecret) {
    return redirectToAccounts('app_not_configured')
  }

  const state = crypto.randomBytes(24).toString('hex')

  // 認可 URL は instagram.ts の共通ビルダーで生成（enable_fb_login=0 等のパラメータを単一情報源化）
  const res = NextResponse.redirect(
    buildInstagramAuthorizeUrl({ clientId, redirectUri: instagramRedirectUri(), state }),
  )
  // state(CSRF)クッキーは OAuth の戻り（instagram.com → 当サイトへの cross-site トップレベル遷移）でも
  // 確実にブラウザから送られる必要がある。SameSite=Lax だと一部の戻り遷移（フル再ログイン経由等）で
  // 取りこぼされ state_missing になるため、SameSite=None(secure必須) を使う。当サイト発行の
  // ファーストパーティ Cookie なので、トップレベル遷移では third-party 制限の影響を受けない。
  // さらに NextResponse.redirect 自身に明示付与して取りこぼしを防ぐ。
  res.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: INSTAGRAM_OAUTH_STATE_MAX_AGE_SEC,
  })
  return res
}
