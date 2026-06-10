// 自分で用意した画像のアップロード (POST /api/upload/image)
//
// 受け取り: { base64: string, mimeType?: string }（クライアントが FileReader で base64 化して送る）
// 返却:     { imageUrl: string }（post-images バケットの公開URL）
//
// 投稿時は X / Meta がサーバー側でこのURLを fetch するため、公開 https URL にする必要がある。
// セキュリティ:
//   - 認証必須
//   - 5MB 上限
//   - クライアント申告の mimeType は信用せず、デコード後のマジックバイトで PNG/JPEG/WebP を判定
//     （Content-Type 混同・非画像アップロードを防ぐ）

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { uploadUserImage } from '@/lib/ai/image'

export const maxDuration = 30

// 各SNSで最も厳しい X の上限(5MB)に合わせる（publish 時の取りこぼしを防ぐ）
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

type ImageKind = { ext: string; contentType: string }

/** デコード済みバッファのマジックバイトから画像種別を判定（信頼できない申告 mime は使わない） */
function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' }
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', contentType: 'image/webp' }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const { base64 } = await req.json().catch(() => ({})) as { base64?: string }
    if (!base64 || typeof base64 !== 'string') {
      return NextResponse.json({ error: '画像データがありません' }, { status: 400 })
    }

    let decoded: Buffer
    try {
      decoded = Buffer.from(base64, 'base64')
    } catch {
      return NextResponse.json({ error: '画像データの形式が不正です' }, { status: 400 })
    }
    if (decoded.length === 0) {
      return NextResponse.json({ error: '画像データが空です' }, { status: 400 })
    }
    if (decoded.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: '画像が大きすぎます（5MB以下にしてください）' }, { status: 400 })
    }

    const kind = sniffImage(decoded)
    if (!kind) {
      return NextResponse.json({ error: 'PNG / JPEG / WebP の画像を選択してください' }, { status: 400 })
    }

    const imageUrl = await uploadUserImage(decoded, kind.ext, kind.contentType, user.id)
    return NextResponse.json({ imageUrl })
  } catch (e) {
    console.error('[upload/image]', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: '画像のアップロードに失敗しました' }, { status: 500 })
  }
}
