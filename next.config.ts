import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remotion 系はサーバーサイド (Node.js) でしか動かないネイティブバイナリを抱えるため、
  // Turbopack / Webpack のバンドル対象から外し、ランタイム require に委ねる。
  // これを入れないと:
  //   ./node_modules/@esbuild/<arch>/README.md  "Unknown module type"
  //   ./node_modules/@remotion/bundler/...
  // で Vercel (Turbopack) ビルドが落ちる。
  //
  // 動画パイプラインは Vercel 上では runtime-env.ts の videoCapability() で 503 を返し
  // 実行されないため、ランタイム require が走ることはない。
  serverExternalPackages: [
    '@remotion/renderer',
    '@remotion/bundler',
    '@remotion/cli',
    'esbuild',
    'puppeteer-core',
    'chrome-aws-lambda',
  ],
};

export default nextConfig;
