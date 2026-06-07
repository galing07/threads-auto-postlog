// 一時診断エンドポイント (GET /api/auth/instagram/debug)
// 「連携ボタンを押したときツールが実際に Instagram へ送る値」を本人がログイン状態で確認するための
// 切り分け用。機密(アプリシークレット/アクセストークン)は一切返さない。
// アプリID(client_id) と redirect_uri はどちらも認可URLに載る"公開値"なので表示してよい。
// 原因が「保存されたアプリID違い」か「Meta側設定(開発モード/権限)」かを一発で切り分ける。
// TODO: 切り分け完了後に削除する。

import 'server-only'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { fetchInstagramAppCredentials } from '@/lib/ai/api-keys'
import { INSTAGRAM_OAUTH_AUTHORIZE_URL, INSTAGRAM_OAUTH_SCOPES } from '@/lib/platforms/instagram'
import { instagramRedirectUri } from '../route'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'ログインしてから開いてください' }, { status: 401 })
  }

  const { appId, appSecret } = await fetchInstagramAppCredentials()
  const redirectUri = instagramRedirectUri()

  const authorizeUrl = appId
    ? `${INSTAGRAM_OAUTH_AUTHORIZE_URL}?` +
      new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: INSTAGRAM_OAUTH_SCOPES.join(','),
        state: 'DEBUG',
      }).toString()
    : null

  return NextResponse.json(
    {
      // アプリID は公開の client_id。2715… なら正(Instagram用)、2805… なら誤(Facebook用)。
      saved_instagram_app_id: appId ?? '(未保存)',
      app_id_starts_with_2715_OK: appId?.startsWith('2715') ?? false,
      app_id_starts_with_2805_NG_facebook: appId?.startsWith('2805') ?? false,
      app_secret_saved: !!appSecret, // 値は出さない。保存有無のみ。
      // Metaの「OAuthリダイレクトURI」にこれと完全一致で登録されている必要がある
      redirect_uri_tool_sends: redirectUri,
      scopes: INSTAGRAM_OAUTH_SCOPES,
      authorize_endpoint: INSTAGRAM_OAUTH_AUTHORIZE_URL,
      full_authorize_url: authorizeUrl,
    },
    { status: 200 },
  )
}
