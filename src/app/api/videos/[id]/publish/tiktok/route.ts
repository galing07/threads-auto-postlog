import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { publishVideoToAccount } from '../../../_lib/publish-helper'
import type { TikTokPrivacy } from '@/lib/platforms/tiktok'

const ALLOWED_PRIVACY: ReadonlyArray<TikTokPrivacy> = [
  'PUBLIC_TO_EVERYONE',
  'MUTUAL_FOLLOW_FRIENDS',
  'FOLLOWER_OF_CREATOR',
  'SELF_ONLY',
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '認証が必要です' }, { status: 401 })

    const body = await req.json() as {
      accountId?: unknown
      caption?: unknown
      privacyLevel?: unknown
      disableComment?: unknown
      disableDuet?: unknown
      disableStitch?: unknown
    }
    const accountId = typeof body.accountId === 'string' ? body.accountId : ''
    const captionRaw = typeof body.caption === 'string' ? body.caption.trim() : ''
    const caption = captionRaw ? captionRaw.slice(0, 2200) : undefined

    const privacyLevel =
      typeof body.privacyLevel === 'string' && (ALLOWED_PRIVACY as readonly string[]).includes(body.privacyLevel)
        ? (body.privacyLevel as TikTokPrivacy)
        : undefined

    return await publishVideoToAccount({
      videoId: id,
      accountId,
      platform: 'tiktok',
      userId: user.id,
      supabase,
      captionOverride: caption,
      publisherOptions: {
        tiktokPrivacyLevel: privacyLevel,
        tiktokDisableComment: body.disableComment === true,
        tiktokDisableDuet: body.disableDuet === true,
        tiktokDisableStitch: body.disableStitch === true,
      },
    })
  } catch (e) {
    console.error('[videos/publish/tiktok]', id, e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'TikTok への公開に失敗しました' }, { status: 500 })
  }
}
