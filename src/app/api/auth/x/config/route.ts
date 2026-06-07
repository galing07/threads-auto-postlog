// X 連携の設定値を返す (GET /api/auth/x/config)
//
// 連携パネルが「X Developer Portal の Callback URI に登録すべき値」を実値で表示するための
// エンドポイント。実フロー (route.ts) と同じ xRedirectUri() を単一情報源として返すので、
// 「表示される値」と「実際に送られる redirect_uri」は必ず一致する（環境ごとのズレを防ぐ）。

import 'server-only'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { xRedirectUri } from '../route'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  return NextResponse.json({ redirectUri: xRedirectUri() })
}
