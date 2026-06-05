// 投稿系の「クライアントに表示しても安全な」公開エラー。
//
// 通常、投稿APIは内部エラーメッセージをクライアントに返さない
// （トークン・DB構造・内部パスなどが漏れうるため）。
// ただし原因特定のために、機密を含まないと保証できるエラーだけは
// この型で投げることで、UI（トースト）やログに具体的な理由を表示する。
//
// 使う側のルールは1つ: message に機密情報を入れないこと。
// （HTTPステータス、プロバイダのエラータイトル/詳細、設定不足の案内などはOK）
export class PublishError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'PublishError'
    this.code = code
  }
}
