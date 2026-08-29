import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Every API error body is `{ error: { message, code } }` (see apps/api/src/lib/errors.ts
// and the global error handler). RTK Query's `error` from a mutation/query is either a
// FetchBaseQueryError (network-level, `.data` holds that parsed body) or a SerializedError
// (thrown before the request even went out) -- this pulls the real server message out of
// the former and falls back to a generic one for everything else, instead of a page
// hardcoding one guessed reason for every possible failure.
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data
    if (data && typeof data === "object" && "error" in data) {
      const inner = (data as { error?: unknown }).error
      if (inner && typeof inner === "object" && "message" in inner && typeof (inner as { message?: unknown }).message === "string") {
        return (inner as { message: string }).message
      }
    }
  }
  return fallback
}

// File downloads (report/prescription PDFs) are plain browser navigations, not RTK Query
// calls, so they never go through api.ts's silent-refresh-on-401 wrapper. The 15-minute
// access token cookie can easily be stale by the time someone clicks a download link they've
// been looking at for a while, and a raw <a href> navigation just shows a bare "Not
// authenticated" JSON error with no chance to recover. Refresh first so the cookie is fresh,
// then open the file -- mirrors what baseQueryWithReauth already does for every other request.
export async function openAuthedFile(url: string): Promise<void> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"
  await fetch(`${apiBase}/auth/refresh`, { method: "POST", credentials: "include" }).catch(() => {})
  window.open(url, "_blank", "noopener,noreferrer")
}
