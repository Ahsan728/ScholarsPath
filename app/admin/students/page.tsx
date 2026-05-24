import { adminSupabase } from "@/lib/supabase"
import { StudentsClient } from "./StudentsClient"

interface StudentRow {
  email: string
  added_by: string | null
  added_at: string
  notes: string | null
}

// Server component: fetch initial list with the service-role client, then hand
// off to the client component for add/remove interactions.
export default async function AdminStudentsPage() {
  const { data, error } = await adminSupabase
    .from("student_allowlist")
    .select("*")
    .order("added_at", { ascending: false })

  const students: StudentRow[] = (data as StudentRow[]) ?? []

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mentorship Students</h1>
        <p className="text-sm text-gray-400 mt-1">
          Emails added here are auto-assigned the <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs text-blue-300">student</code> tier on signup or next login.
          Students get Pro-equivalent access plus exclusive CV/Transcript evaluation.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
          Failed to load: {error.message}
        </div>
      )}

      <StudentsClient initialStudents={students} />
    </div>
  )
}
