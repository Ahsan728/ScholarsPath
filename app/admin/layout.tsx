import Link from "next/link"
import { GraduationCap, BarChart2, LogOut, UserCheck, Receipt, MessageSquareWarning, Bot, Library, Award, Sliders, Users } from "lucide-react"

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
          <Link href="/admin/payments" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Receipt className="h-4 w-4" /> Payments
          </Link>
          <Link href="/admin/students" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <UserCheck className="h-4 w-4" /> Students
          </Link>
          <Link href="/admin/feedback" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <MessageSquareWarning className="h-4 w-4" /> Feedback
          </Link>
          <Link href="/admin/acceptances" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Award className="h-4 w-4" /> Acceptances
          </Link>
          <Link href="/admin/crawlers" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Bot className="h-4 w-4" /> Crawlers
          </Link>
          <Link href="/admin/agents" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Sliders className="h-4 w-4" /> Agents
          </Link>
          <Link href="/admin/sources" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Library className="h-4 w-4" /> Sources
          </Link>
          <Link href="/admin/opportunities" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
            <Award className="h-4 w-4" /> Opportunities
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
