"use client"

import { useRouter, useSearchParams } from "next/navigation"

interface Props {
  currentFilters: Record<string, string | undefined>
}

const TYPES = ["scholarship", "phd", "postdoc", "fellowship", "grant", "internship", "exchange"]
const LEVELS = ["undergraduate", "masters", "phd", "postdoc", "any"]
const FUNDING = ["full", "partial", "stipend", "salary"]

// Research domain → array of substring keywords matched (case-insensitive)
// against the field_of_study text array on each opportunity. Same labels
// as the program catalog filter chips so the experience is consistent.
const RESEARCH_DOMAINS = [
  { value: "cs_ai", label: "CS / AI", keywords: ["computer", "ai", "artificial intelligence", "data science", "cyber", "software", "machine learning", "information"] },
  { value: "engineering", label: "Engineering", keywords: ["engineering", "robotics", "mechanical", "electrical", "civil", "chemical", "materials", "aerospace", "energy"] },
  { value: "architecture", label: "Architecture", keywords: ["architecture", "architectural", "urban design", "interior design", "landscape architecture", "urban planning"] },
  { value: "science", label: "Science", keywords: ["physics", "chemistry", "biology", "mathematics", "biotech", "natural science", "earth", "marine"] },
  { value: "environment", label: "Environment", keywords: ["environmental", "sustainability", "climate", "renewable", "ecology", "biodiversity", "conservation"] },
  { value: "health", label: "Health / Medicine", keywords: ["health", "medicine", "medical", "biomedical", "pharma", "clinical", "neuroscience", "psychology"] },
  { value: "business", label: "Business", keywords: ["business", "management", "finance", "economics", "marketing", "mba", "accounting"] },
  { value: "social", label: "Social Sciences", keywords: ["social", "political", "law", "international relations", "public policy", "communication", "journalism"] },
  { value: "arts", label: "Arts & Humanities", keywords: ["arts", "humanities", "design", "philosophy", "history", "music", "literature"] },
  { value: "agriculture", label: "Agriculture", keywords: ["agriculture", "agronomy", "food", "forestry", "aquaculture"] },
  { value: "all", label: "All Fields", keywords: [] },
]

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

      {/* Research Domain / Field of Study */}
      <FilterSection title="Research Domain">
        <div className="flex flex-wrap gap-1.5">
          {RESEARCH_DOMAINS.map((d) => (
            <FilterChip
              key={d.value}
              label={d.label}
              active={currentFilters.field === d.value}
              onClick={() => setFilter("field", d.value)}
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

// Map a research domain slug to the array of keyword substrings used to
// match against opportunity field_of_study values. Imported by
// lib/supabase.ts::getOpportunities to translate ?field=cs_ai into the
// actual DB filter.
export function getDomainKeywords(slug: string): string[] {
  const d = RESEARCH_DOMAINS.find((x) => x.value === slug)
  return d?.keywords ?? []
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
