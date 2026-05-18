/**
 * 生成系のデフォルトプロンプトテンプレート（UI で「現在使われているデフォルト」として表示する用）
 *
 * 動的な部分（{persona} などのプレースホルダー）は実行時に置換される。
 * ここではテンプレート文字列をそのまま定数として export し、UI で表示する。
 * クライアント / サーバー両方から import できるよう pure module にする（server-only 禁止）。
 */

// 実際にAIへ送られるシステムプロンプトのテンプレート。
// {波括弧} の変数は生成時に実値へ置換される（出力JSON例の {} は変数名でないため温存される）。
export const DEFAULT_TEXT_PROMPT_TEMPLATE = `{persona}として{platform}投稿を作成するSNSライター。

ペルソナ:{persona} / ターゲット:{audience} / テーマ:{topics} / 文体:{tone}{postTypeGuide}{pastSummaries}

{platformRule}`

export const DEFAULT_IMAGE_PROMPT_TEMPLATE = `投稿本文から以下の手順で画像生成プロンプトを構築:

1. タイトル行を抽出（【】や「」で囲まれた行、または最初の行）
2. 番号付き箇条書き（①②③ or 1.2.3. or ・→）を最大4つ抽出
3. ハッシュタグを除いた本文から主要キーワードを抽出

【生成画像の方針】
- Infographic poster in Japanese career advice style
- Title text: 抽出したタイトル
- 番号付きポイントがある場合: numbered points as labeled boxes (with icons)
- Clean flat design, white background, blue and green accent colors
- Modern professional layout, 1:1 square format

【スタイル選択肢】
- diagram: Clean diagram infographic, flat design, pastel colors, minimal icons
- infographic: Modern infographic, clean typography, data visualization, blue and white
- minimal: Minimal clean design, simple illustration, soft colors`

export const DEFAULT_THEMES_PROMPT_TEMPLATE = `{persona}として、{audience}向けのThreads投稿テーマを15個考えてください。
テーマ一覧:{topics}

【すでに投稿済み・使用済みのテーマ（これらと被らないこと）】
{usedThemes}

条件:
- 具体的で検索・共感されやすいタイトル
- バズ型・共感型・数字型・体験談型・問いかけ型をバランスよく混ぜる
- 各テーマは20〜40文字程度
- すでに投稿済みのテーマと内容・切り口が被らないこと
- 必ずJSON配列で返す

返答形式（他の文章は不要）:
["テーマ1", "テーマ2", "テーマ3", ...]`

/**
 * テンプレート中の {key} を vars[key] で置換する。
 * vars に無いキー（出力 JSON 例の {content} 等）はそのまま温存される。
 */
export function resolvePrompt(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v),
    template,
  )
}

// text テンプレートで使える変数（UI の凡例表示用）
export const TEXT_PROMPT_VARS: { key: string; desc: string }[] = [
  { key: 'persona', desc: 'アカウントのペルソナ' },
  { key: 'platform', desc: '投稿先（Threads / Instagram / X (Twitter)）' },
  { key: 'audience', desc: 'ターゲット層' },
  { key: 'topics', desc: '発信テーマ一覧' },
  { key: 'tone', desc: '文体トーンの説明' },
  { key: 'postTypeGuide', desc: '選択した投稿の型の詳細ガイド（自動挿入）' },
  { key: 'pastSummaries', desc: '過去投稿の要約（重複回避・自動挿入）' },
  { key: 'platformRule', desc: '文字数やハッシュタグ等のプラットフォーム別ルール' },
]

export type PromptKind = 'text' | 'image' | 'themes'

export const PROMPT_PRESETS: Record<PromptKind, { label: string; description: string; template: string }> = {
  text: {
    label: 'テキスト生成（投稿本文）',
    description: 'OpenRouter Gemini に渡すシステムプロンプト。投稿の型・トーン・プラットフォーム別ルールを含む',
    template: DEFAULT_TEXT_PROMPT_TEMPLATE,
  },
  image: {
    label: '画像生成（図解）',
    description: 'OpenAI gpt-image-2 に渡す画像生成プロンプトのテンプレート',
    template: DEFAULT_IMAGE_PROMPT_TEMPLATE,
  },
  themes: {
    label: 'テーマ提案',
    description: '「テーマを提案」ボタンで使われるテーマ生成プロンプト',
    template: DEFAULT_THEMES_PROMPT_TEMPLATE,
  },
}
