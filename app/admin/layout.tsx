import Link from "next/link"
import { GraduationCap, BarChart2, Users, Zap, LogOut } from "lucide-react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-blue-400" />
            <span className="font-bold text-sm text-white">SA Admin</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Analytics & Budget</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <BarChart2 className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/admin/users" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Users className="h-4 w-4" /> Users
          </Link>
          <Link href="/admin/usage" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Zap className="h-4 w-4" /> API Usage
          </Link>
        </nav>

        <div className="p-3 border-t border-gray-800">
          <form action="/api/admin/logout" method="POST">
            <button className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-56">
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
