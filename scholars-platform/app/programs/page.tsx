import { Suspense } from "react"
import ProgramBrowser from "@/components/ProgramBrowser"

export default function ProgramsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Study in Europe</h1>
          <p className="text-gray-500 mt-1">
            Browse bachelor, master, and language programs from top European universities.
          </p>
        </div>
        <Suspense fallback={
          <div className="flex gap-6">
            <div className="lg:w-72 shrink-0 bg-white rounded-xl border h-96 animate-pulse" />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border h-56 animate-pulse" />
              ))}
            </div>
          </div>
        }>
          <ProgramBrowser />
        </Suspense>
      </div>
    </div>
  )
}
