export type OpportunityType =
  | "scholarship"
  | "grant"
  | "phd"
  | "postdoc"
  | "fellowship"
  | "internship"
  | "bursary"
  | "exchange"

export type FundingType = "full" | "partial" | "stipend" | "salary"
export type DegreeLevel = "undergraduate" | "masters" | "phd" | "postdoc" | "any"
export type OpportunityStatus = "open" | "closed" | "rolling" | "upcoming"
export type DigestFrequency = "daily" | "weekly" | "never"

export interface Opportunity {
  id: string
  title: string
  type: OpportunityType
  host_country: string[]
  eligible_nations: string[]   // ["ALL"] or ISO-2 codes e.g. ["BD","PK","NG"]
  ineligible_nations: string[]
  field_of_study: string[]
  degree_level: DegreeLevel
  funding_type: FundingType | null
  amount_usd: number | null
  currency: string | null
  deadline: string | null       // ISO date string
  open_date: string | null
  status: OpportunityStatus
  description: string
  eligibility_text: string | null
  requirements: string[]
  apply_url: string
  source_url: string
  source_name: string
  is_verified: boolean
  is_featured: boolean
  scam_score: number
  embedding_id: string | null
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  full_name: string | null
  nationality: string[]
  residence: string | null
  field_of_study: string[]
  degree_level: DegreeLevel | null
  target_countries: string[]
  digest_frequency: DigestFrequency
  telegram_id: string | null
  onboarded: boolean
  created_at: string
}

export interface SearchFilters {
  query?: string
  type?: OpportunityType[]
  host_country?: string[]
  eligible_for?: string        // ISO-2 nationality code
  field?: string[]
  degree_level?: DegreeLevel[]
  funding_type?: FundingType[]
  status?: OpportunityStatus
  deadline_before?: string
  deadline_after?: string
  page?: number
  limit?: number
}

export interface SearchResult {
  opportunities: Opportunity[]
  total: number
  page: number
  has_more: boolean
}

export interface RAGResponse {
  answer: string
  sources: Opportunity[]
  query: string
}
