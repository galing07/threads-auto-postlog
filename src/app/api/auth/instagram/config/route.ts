// Instagram 連携の設定値を返す (GET /api/auth/instagram/config)
//
// 連携パネルが「Meta のビジネスログイン設定に登録すべきリダイレクト URI」を
// 実値で表示するためのエンドポイント。これにより、ガイドにドメインをハードコードして
// 環境ごとにズレる問題（別環境では認証を開始できない）を根絶する。
// 実フロー (route.ts) と同じ instagramRedirectUri() を単一情報源として返すので、
// 「表示される値」と「実際に送られる redirect_uri」は必ず一致する。

import 'server-only'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { instagramRedirectUri } from '../route'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  return NextResponse.json({ redirectUri: instagramRedirectUri() })
}
