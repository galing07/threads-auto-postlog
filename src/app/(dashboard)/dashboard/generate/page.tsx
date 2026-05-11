'use client'

import Link from 'next/link'
import { MessageCircle, ArrowRight, ImageIcon, X as XIcon, Camera } from 'lucide-react'

export default function GeneratePage() {
  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold lg:text-2xl" style={{ color: '#061b31' }}>
          投稿生成
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">投稿するプラットフォームを選択してください</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 max-w-3xl">
        {/* Threads */}
        <Link href="/dashboard/generate/threads" className="group block">
          <div className="flex h-full flex-col rounded-xl border border-[#e5edf5] bg-white p-6 shadow-sm transition-all hover:border-[#00A3BF] hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Threads</h2>
            <p className="mt-1 text-sm text-gray-500 flex-1">
              テキスト投稿 + AI図解画像を生成してThreadsに投稿します
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <MessageCircle className="h-3 w-3" />テキスト
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <ImageIcon className="h-3 w-3" />図解画像
              </span>
            </div>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[#006F83] group-hover:text-[#005A6B] transition-colors">
              生成する
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>

        {/* Instagram */}
        <Link href="/dashboard/generate/instagram" className="group block">
          <div className="flex h-full flex-col rounded-xl border border-[#e5edf5] bg-white p-6 shadow-sm transition-all hover:border-pink-400 hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 via-fuchsia-500 to-orange-400">
              <Camera className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Instagram</h2>
            <p className="mt-1 text-sm text-gray-500 flex-1">
              画像 + AIキャプションを生成してInstagramに投稿します
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <ImageIcon className="h-3 w-3" />画像必須
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <MessageCircle className="h-3 w-3" />キャプション
              </span>
            </div>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-pink-600 group-hover:text-pink-700 transition-colors">
              生成する
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>

        {/* X */}
        <Link href="/dashboard/generate/x" className="group block">
          <div className="flex h-full flex-col rounded-xl border border-[#e5edf5] bg-white p-6 shadow-sm transition-all hover:border-gray-700 hover:shadow-md">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-black">
              <XIcon className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">X（Twitter）</h2>
            <p className="mt-1 text-sm text-gray-500 flex-1">
              単発ツイートまたはスレッドを生成してXに直接投稿します
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <MessageCircle className="h-3 w-3" />単発
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                <MessageCircle className="h-3 w-3" />スレッド
              </span>
            </div>
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">
              生成する
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>

      </div>
    </div>
  )
}
