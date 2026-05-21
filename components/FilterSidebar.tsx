"use client"

import { useRouter, useSearchParams } from "next/navigation"

interface Props {
  currentFilters: Record<string, string | undefined>
}

const TYPES = ["scholarship", "phd", "postdoc", "fellowship", "grant", "internship", "exchange"]
const LEVELS = ["undergraduate", "masters", "phd", "postdoc", "any"]
const FUNDING = ["full", "partial", "stipend", "salary"]

const BD_NATIONALITIES = [
  { code: "BD", label: "Bangladesh" },
  { code: "PK", label: "Pakistan" },
  { code: "IN", label: "India" },
  { code: "NG", label: "Nigeria" },
  { code: "KE", label: "Kenya" },
  { code: "GH", label: "Ghana" },
  { code: "ET", label: "Ethiopia" },
  { code: "ALL", label: "All countries" },
]

export function FilterSidebar({ currentFilters }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (params.get(key) === value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete("page")
    router.push(`/?${params}`)
  }

  function clearAll() {
    router.push("/")
  }

  const hasFilters = Object.values(currentFilters).some(Boolean)

  return (
    <div className="sticky top-4 rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Filters</h3>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Nationality */}
      <FilterSection title="For Nationality">
        <div className="space-y-1">
          {BD_NATIONALITIES.map(({ code, label }) => (
            <FilterChip
              key={code}
              label={label}
              active={currentFilters.for === code}
              onClick={() => setFilter("for", code)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Type */}
      <FilterSection title="Opportunity Type">
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <FilterChip
              key={t}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              active={currentFilters.type === t}
              onClick={() => setFilter("type", t)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Degree Level */}
      <FilterSection title="Degree Level">
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => (
            <FilterChip
              key={l}
              label={l.charAt(0).toUpperCase() + l.slice(1)}
              active={currentFilters.level === l}
              onClick={() => setFilter("level", l)}
            />
          ))}
        </div>
      </FilterSection>

      {/* Funding */}
      <FilterSection title="Funding Type">
        <div className="flex flex-wrap gap-1.5">
          {FUNDING.map((f) => (
            <FilterChip
              key={f}
              label={f.charAt(0).toUpperCase() + f.slice(1)}
              active={currentFilters.funding === f}
              onClick={() => setFilter("funding", f)}
            />
          ))}
        </div>
      </FilterSection>
    </div>
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-4 border-t pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </p>
      {children}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-blue-500 bg-blue-50 font-medium text-blue-700"
          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  )
}
