import Link from 'next/link'
import { PenLine, CalendarClock, Users, ScrollText, LayoutDashboard } from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'ホーム', icon: LayoutDashboard },
  { href: '/dashboard/generate', label: '投稿生成', icon: PenLine },
  { href: '/dashboard/schedule', label: 'スケジュール', icon: CalendarClock },
  { href: '/dashboard/accounts', label: 'アカウント', icon: Users },
  { href: '/dashboard/logs', label: 'ログ', icon: ScrollText },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">SNS Auto Post</h1>
          <p className="text-xs text-gray-500 mt-0.5">Threads自動投稿</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              <Icon size={18} className="text-gray-500" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-200">
          <p className="text-xs text-gray-400">v1.0.0</p>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
