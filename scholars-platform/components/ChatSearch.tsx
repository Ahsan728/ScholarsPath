"use client"

import { useState, useRef, useEffect } from "react"
import { Send, Loader2, Bot } from "lucide-react"
import { OpportunityCard } from "./OpportunityCard"
import { UpgradeModal } from "./UpgradeModal"
import type { Opportunity } from "@/types"

interface Message {
  role: "user" | "assistant"
  content: string
  sources?: Opportunity[]
}

const EXAMPLE_QUERIES = [
  "Fully funded PhD in AI for Bangladeshi students",
  "Masters scholarships in Germany closing after June 2025",
  "Postdoc positions in climate science UK",
  "Fellowships for researchers from developing countries",
]

export function ChatSearch() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend(query?: string) {
    const text = (query ?? input).trim()
    if (!text || loading) return

    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setLoading(true)

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, mode: "rag" }),
      })

      const data = await res.json()

      if (res.status === 429 && data.error === "limit_reached") {
        setShowUpgrade(true)
        return
      }

      if (data.error) throw new Error(data.error)

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer ?? "Here are the most relevant opportunities I found:",
          sources: data.sources ?? [],
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I ran into an error. Please try again.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    {showUpgrade && <UpgradeModal reason="rag_limit" onClose={() => setShowUpgrade(false)} />}
    <div className="rounded-2xl border bg-white shadow-sm">
      {/* Chat history */}
      <div className="max-h-[500px] overflow-y-auto p-4 space-y-4">
        {/* Welcome */}
        {messages.length === 0 && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <Bot className="h-4 w-4 text-blue-600" />
            </div>
            <div className="chat-bubble-ai">
              <p className="text-sm">
                Hi! I&apos;m ScholarAssist AI. Tell me what you&apos;re looking for and I&apos;ll
                find the best matching scholarships, PhD positions, and fellowships for you.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="rounded-full border border-blue-200 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <div className="chat-bubble-user text-sm">{msg.content}</div>
              </div>
            ) : (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <Bot className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="chat-bubble-ai text-sm whitespace-pre-wrap">
                    {msg.content}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {msg.sources.slice(0, 4).map((opp) => (
                        <OpportunityCard key={opp.id} opportunity={opp} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            </div>
            <div className="chat-bubble-ai text-sm text-gray-400">
              Searching for the best opportunities...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything... e.g. PhD positions in Germany for Bangladeshi students"
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
    </>
  )
}
