export const metadata = {
  title: 'プライバシーポリシー — SNS Auto Post',
  description: 'SNS Auto Post のプライバシーポリシー（個人情報・連携アカウント情報の取り扱い）',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">プライバシーポリシー</h1>
        <p className="mb-8 text-sm text-gray-500">最終更新日: 2026年6月7日</p>

        <section className="space-y-6 text-sm leading-relaxed text-gray-700">
          <div>
            <p>
              SNS Auto Post（以下「本サービス」）は、ユーザーが各SNS（Instagram、Threads、
              X(Twitter)、TikTok、YouTube）への投稿を作成・予約・自動投稿するためのツールです。
              本ポリシーは、本サービスが取得する情報とその取り扱いについて定めます。
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">1. 取得する情報</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>アカウント登録情報（メールアドレス等の認証情報）</li>
              <li>
                ユーザーが連携した各SNSのアクセストークン・アカウントID・ユーザー名
                （投稿APIの実行に必要な範囲）
              </li>
              <li>ユーザーが作成・投稿した文章・画像・動画などのコンテンツ</li>
              <li>各SNSのアプリID・アプリシークレット等、ユーザーが設定した連携用の資格情報</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">2. 利用目的</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>ユーザーに代わって、連携先SNSへ投稿・予約投稿を行うため</li>
              <li>投稿の生成・管理・履歴表示などサービス機能を提供するため</li>
              <li>アクセストークンの自動更新など、連携状態を維持するため</li>
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">3. 情報の管理・保護</h2>
            <p>
              アクセストークン・アプリシークレット等の機密情報は、AES-256-GCM により暗号化して
              保存します。これらの情報は投稿APIの実行目的にのみ使用し、第三者へ販売・提供しません。
              Instagram/Threads から取得した情報は、Meta プラットフォームの規約に従って取り扱います。
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">4. 第三者提供</h2>
            <p>
              本サービスは、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者へ提供しません。
              投稿実行のために各SNSの公式APIへ必要な情報を送信する場合があります。
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">5. データの削除</h2>
            <p>
              ユーザーは、連携アカウントの削除またはアカウント解約により、保存された連携情報・
              トークン・コンテンツの削除を要求できます。連携解除時、対応するアクセストークン等は
              サーバーから削除されます。削除リクエストの状況は削除確認ページで確認できます。
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">6. お問い合わせ</h2>
            <p>
              本ポリシーに関するお問い合わせは、本サービスの管理者までご連絡ください。
              本ポリシーは予告なく改定される場合があります。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
