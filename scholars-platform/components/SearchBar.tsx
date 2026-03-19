"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  initialQuery?: string
  large?: boolean
}

export function SearchBar({ initialQuery = "", large }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(initialQuery)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams(searchParams.toString())
    if (query.trim()) {
      params.set("q", query.trim())
    } else {
      params.delete("q")
    }
    params.delete("page")
    startTransition(() => {
      router.push(`/?${params}`)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <Search
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 text-gray-400",
          large ? "h-5 w-5" : "h-4 w-4"
        )}
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={
          large
            ? "Search scholarships, PhD positions, fellowships..."
            : "Search opportunities..."
        }
        className={cn(
          "w-full rounded-xl border bg-white pl-11 pr-16 text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500",
          large ? "py-4 text-base" : "py-2.5 text-sm"
        )}
      />
      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-blue-600 font-medium text-white hover:bg-blue-700 disabled:opacity-60",
          large ? "px-5 py-2 text-sm" : "px-3 py-1.5 text-xs"
        )}
      >
        {isPending ? "..." : "Search"}
      </button>
    </form>
  )
}
