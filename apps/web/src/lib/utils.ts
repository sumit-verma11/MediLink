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
