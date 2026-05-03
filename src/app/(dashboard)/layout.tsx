'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  PenLine,
  CalendarClock,
  Users,
  ScrollText,
  LayoutDashboard,
  LogOut,
  Zap,
} from 'lucide-react'
import { cx } from '@/lib/utils'
import { createClient } from '@/lib/supabase-browser'

const navItems = [
  { href: '/dashboard', label: 'ホーム', icon: LayoutDashboard },
  { href: '/dashboard/generate', label: '投稿生成', icon: PenLine },
  { href: '/dashboard/schedule', label: 'スケジュール', icon: CalendarClock },
  { href: '/dashboard/accounts', label: 'アカウント', icon: Users },
  { href: '/dashboard/logs', label: 'ログ', icon: ScrollText },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <nav className="flex w-56 flex-col bg-gray-950 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 shrink-0">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">AutoPost</p>
            <p className="text-[11px] text-gray-500 leading-tight">Threads</p>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex flex-1 flex-col gap-0.5 px-2 py-3 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200',
                )}
              >
                <Icon
                  className={cx('h-4 w-4 shrink-0', active ? 'text-blue-400' : 'text-gray-500')}
                />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 px-2 py-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            ログアウト
          </button>
          <p className="mt-1 px-3 text-[11px] text-gray-600">v1.0.0</p>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
