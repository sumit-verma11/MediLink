import { cn } from "@/lib/utils"

const NODES = [
  { cx: 60, color: "var(--primary)" },
  { cx: 180, color: "var(--accent)" },
  { cx: 300, color: "var(--verified)" },
  { cx: 380, color: "var(--primary)" },
]

// The signature motif: a case moves patient -> doctor -> lab -> admin like a
// chain of custody, each handoff logged (this is literally what AuditLog and
// Appointment.timeline record). Four linked nodes replace a generic heartbeat
// squiggle with something specific to what this product actually does.
export function ChainBackground({ className }: { className?: string }) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden="true"
    >
      <div
        className="absolute -top-8 -right-8 h-36 w-36 rounded-full opacity-25"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />
      <svg className="absolute bottom-8 left-0 w-full" height="60" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d="M0 30 H400" stroke="var(--border)" strokeWidth={2} fill="none" />
        <path
          d="M0 30 H400"
          stroke="var(--primary)"
          strokeWidth={2}
          fill="none"
          className="chain-path"
        />
        {NODES.map((node, i) => (
          <circle
            key={i}
            cx={node.cx}
            cy={30}
            r={7}
            fill={node.color}
            className="chain-node"
            style={{ animationDelay: `${0.3 + i * 0.15}s` }}
          />
        ))}
      </svg>
    </div>
  )
}
