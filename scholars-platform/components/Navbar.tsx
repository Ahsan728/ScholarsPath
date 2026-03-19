import Link from "next/link"
import { GraduationCap } from "lucide-react"

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-blue-700">
          <GraduationCap className="h-6 w-6" />
          <span>ScholarPath</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-6 text-sm text-gray-600">
          <Link href="/?type=scholarship" className="hover:text-gray-900">
            Scholarships
          </Link>
          <Link href="/?type=phd" className="hover:text-gray-900">
            PhD Positions
          </Link>
          <Link href="/?type=fellowship" className="hover:text-gray-900">
            Fellowships
          </Link>
          <Link href="/?for=BD" className="font-medium text-blue-600 hover:text-blue-700">
            For BD Students
          </Link>
        </div>
      </div>
    </nav>
  )
}
