import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    threadsAppId: process.env.THREADS_APP_ID ?? '',
    hasThreadsAppSecret: Boolean(process.env.THREADS_APP_SECRET),
  })
}
