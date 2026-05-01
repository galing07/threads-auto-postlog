import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "SNS Auto Post",
  description: "Threads自動投稿管理システム",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
