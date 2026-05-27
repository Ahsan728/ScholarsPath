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

// ============================================================
// MASTERS PROGRAM FINDER
// ============================================================

export interface MastersProgram {
  id: string
  university: string
  program_name: string
  country: string
  city: string
  field_of_study: string[]
  category: string
  level?: 'bachelor' | 'master' | 'language'
  source_name?: string
  source_url?: string
  duration_years: number
  tuition_usd_year: number | null
  language: string
  ielts_min: number | null
  gre_required: boolean
  gpa_min: number | null
  gpa_scale: number
  intake: string
  deadline: string | null
  scholarship_available: boolean
  description: string
  requirements: string[]
  apply_url: string
  qs_ranking: number | null
  is_active: boolean
  created_at: string
  updated_at?: string
  // Erasmus Mundus Joint Masters fields (Phase E)
  program_type?: 'standard' | 'erasmus_mundus_joint' | 'erasmus_mundus_design'
  consortium_universities?: string[]
  consortium_countries?: string[]
  emjm_code?: string | null
  emjm_scholarship_eur?: number | null
  emjm_intake_starts?: string | null
  emjm_application_window?: string | null
}

export interface ProgramFilters {
  level?: 'bachelor' | 'master' | 'language' | 'all'
  category?: string
  country?: string[]
  city?: string
  free_only?: boolean
  scholarship_only?: boolean
  emjm_only?: boolean
  query?: string
  page?: number
  limit?: number
}

export interface StudentProfile {
  name?: string | null
  current_degree: string
  field: string
  gpa: number | null
  gpa_scale: number
  university: string
  graduation_year: number | null
  skills: string[]
  work_experience_years: number
  english_proficiency?: string | null
  gre_score?: string | null
  career_goals?: string | null
}

export interface ProgramMatch {
  program: MastersProgram
  fit_score: number
  reasons: string[]
  concerns: string[]
  recommendation: string
}

export interface StudentSearchProfile {
  bachelor_subject: string      // label from dropdown e.g. "Computer Science / AI"
  category: string              // 'cs_ai' | 'engineering' | 'business' | 'science' | 'all'
  gpa: number
  gpa_scale: number             // 4.0 | 5.0 | 10.0 | 100
  english_type: 'ielts' | 'toefl' | 'none'
  english_score: number | null
  countries: string[]           // [] means no preference
}

export interface MatchSession {
  id: string
  email: string | null
  extracted_profile: StudentProfile
  matched_programs: ProgramMatch[]
  is_registered: boolean
  created_at: string
}

// ============================================================
// TIER / SUBSCRIPTION SYSTEM
// ============================================================

// 'student' tier = Mentorship Program members (allowlisted by email).
// Get everything Pro has PLUS exclusive CV/Transcript evaluation.
export type UserTier = 'free' | 'pro' | 'student'

export interface Subscription {
  id: string
  user_id: string
  tier: UserTier
  stripe_customer_id: string | null
  stripe_sub_id: string | null
  current_period_end: string | null
  created_at: string
}

export interface TierCheckResult {
  allowed: boolean
  used: number
  limit: number
  is_pro: boolean
  // True when the feature is reserved for Mentorship Program students only.
  // Set by checkCvEvalLimit for any non-student tier (free, pro).
  student_only?: boolean
}

// ============================================================
// CV + TRANSCRIPT EVALUATION
// ============================================================

export interface EvaluationResult {
  profile_summary: string
  student_profile: StudentProfile
  program_matches: ProgramMatch[]
  opportunity_matches: Opportunity[]
  session_id: string | null
}
