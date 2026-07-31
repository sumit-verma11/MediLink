import { cn } from "@/lib/utils"

export function HeartbeatBackground({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <div
        className="absolute -top-8 -right-8 h-36 w-36 rounded-full opacity-35"
        style={{ background: "radial-gradient(circle, #3A7CA5 0%, transparent 70%)" }}
      />
      <svg
        className="absolute bottom-8 left-0 w-full"
        height="60"
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
      >
        <path
          d="M0 30 H140 L155 10 L170 50 L185 30 H260 L272 18 L284 42 L296 30 H400"
          stroke="var(--primary)"
          strokeWidth={2.5}
          fill="none"
          className="heartbeat-path"
        />
      </svg>
    </div>
  )
}
