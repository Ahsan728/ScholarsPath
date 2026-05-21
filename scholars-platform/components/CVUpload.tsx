"use client"

import { useRef, useState } from "react"
import { FileText, Upload, X } from "lucide-react"

interface FileDropZoneProps {
  label: string
  required?: boolean
  file: File | null
  onChange: (file: File | null) => void
}

function FileDropZone({ label, required, file, onChange }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (f: File | null) => {
    if (!f) return
    if (f.type !== "application/pdf") {
      alert("Only PDF files are accepted.")
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum size is 10 MB.")
      return
    }
    onChange(f)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0] ?? null)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex-1">
      <p className="mb-1.5 text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
        <span className="ml-1 text-xs font-normal text-gray-400">PDF only, max 10 MB</span>
      </p>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <FileText className="h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-800">{file.name}</p>
            <p className="text-xs text-gray-500">{formatSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-full p-1 text-gray-400 hover:bg-blue-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
            dragging
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50/50"
          }`}
        >
          <Upload className={`h-7 w-7 ${dragging ? "text-blue-500" : "text-gray-400"}`} />
          <span className="text-sm text-gray-500">
            <span className="font-medium text-blue-600">Click to browse</span> or drag and drop
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
    </div>
  )
}

interface CVUploadProps {
  cvFile: File | null
  transcriptFile: File | null
  onCVChange: (file: File | null) => void
  onTranscriptChange: (file: File | null) => void
}

export function CVUpload({ cvFile, transcriptFile, onCVChange, onTranscriptChange }: CVUploadProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <FileDropZone
        label="CV / Resume"
        required
        file={cvFile}
        onChange={onCVChange}
      />
      <FileDropZone
        label="Academic Transcript"
        file={transcriptFile}
        onChange={onTranscriptChange}
      />
    </div>
  )
}
