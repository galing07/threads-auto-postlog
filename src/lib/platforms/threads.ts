// Threads Graph API adapter
// Meta Threads API: https://developers.facebook.com/docs/threads

const THREADS_API_BASE = 'https://graph.threads.net/v1.0'

interface ThreadsCredentials {
  accessToken: string
  userId: string
}

interface CreatePostOptions {
  text: string
  imageUrl?: string
}

interface ThreadsPostResult {
  id: string
  permalink?: string
}

async function threadsRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${THREADS_API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(`Threads API error: ${JSON.stringify(error)}`)
  }

  return res.json() as Promise<T>
}

export async function createThreadsPost(
  credentials: ThreadsCredentials,
  { text, imageUrl }: CreatePostOptions
): Promise<ThreadsPostResult> {
  const { accessToken, userId } = credentials

  // Step 1: メディアコンテナ作成
  const mediaType = imageUrl ? 'IMAGE' : 'TEXT'
  const containerBody: Record<string, string> = {
    media_type: mediaType,
    text,
    access_token: accessToken,
  }
  if (imageUrl) containerBody.image_url = imageUrl

  const container = await threadsRequest<{ id: string }>(
    `/${userId}/threads`,
    {
      method: 'POST',
      body: JSON.stringify(containerBody),
    }
  )

  // Step 2: 公開
  const published = await threadsRequest<{ id: string }>(
    `/${userId}/threads_publish`,
    {
      method: 'POST',
      body: JSON.stringify({
        creation_id: container.id,
        access_token: accessToken,
      }),
    }
  )

  return { id: published.id }
}

export async function getThreadsProfile(credentials: ThreadsCredentials) {
  const { accessToken, userId } = credentials
  return threadsRequest<{ id: string; username: string; name: string }>(
    `/${userId}?fields=id,username,name&access_token=${accessToken}`
  )
}

export async function refreshLongLivedToken(token: string): Promise<string> {
  const res = await threadsRequest<{ access_token: string }>(
    `/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`
  )
  return res.access_token
}
