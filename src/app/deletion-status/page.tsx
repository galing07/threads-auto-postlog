import { Suspense } from 'react'

export const metadata = {
  title: '削除リクエスト確認 — SNS Auto Post',
}

function DeletionStatus({ searchParams }: { searchParams: { code?: string } }) {
  const code = searchParams.code

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-3 text-xl font-bold text-gray-900">データ削除リクエスト</h1>
        <p className="mb-4 text-sm text-gray-600">
          あなたのThreads連携データの削除リクエストを受け付けました。
          関連するアカウント情報・投稿データはすべてサーバーから削除されています。
        </p>
        {code && (
          <div className="rounded-md bg-gray-100 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">確認コード</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-700">{code}</p>
          </div>
        )}
        <p className="mt-4 text-xs text-gray-500">
          ご質問がある場合は、アプリ管理者までお問い合わせください。
        </p>
      </div>
    </div>
  )
}

export default function Page({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  return (
    <Suspense>
      <DeletionStatusWrapper searchParams={searchParams} />
    </Suspense>
  )
}

async function DeletionStatusWrapper({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const params = await searchParams
  return <DeletionStatus searchParams={params} />
}
