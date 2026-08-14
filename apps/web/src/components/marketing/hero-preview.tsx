import { CalendarCheck, FlaskConical, Star } from "lucide-react";
import { HeartbeatBackground } from "@/components/ui/heartbeat-background";
import { StatusBadge } from "@/components/ui/status-badge";

export function HeroPreview() {
  return (
    <div className="relative h-full w-full">
      <HeartbeatBackground className="opacity-70" />

      <div
        className="animate-fade-up absolute left-6 top-8 w-52 rounded-2xl bg-card p-4 shadow-xl ring-1 ring-foreground/10 sm:left-8 sm:top-10 sm:w-60"
        style={{ animationDelay: "120ms" }}
      >
        <p className="text-xs font-medium text-muted-foreground">Symptom match</p>
        <p className="mt-1 text-sm font-semibold text-foreground">Dermatology</p>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-[85%] rounded-full bg-accent" />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">High confidence match</p>
      </div>

      <div
        className="animate-fade-up absolute right-6 top-40 w-44 rounded-2xl bg-card p-3.5 shadow-xl ring-1 ring-foreground/10 sm:right-10 sm:top-44"
        style={{ animationDelay: "200ms" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary">
            <FlaskConical className="size-3.5 text-primary" />
          </div>
          <p className="text-xs font-semibold text-foreground">Lipid panel</p>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Star className="size-3 fill-accent text-accent" />
          Report ready
        </div>
      </div>

      <div
        className="animate-fade-up absolute bottom-8 left-10 w-56 rounded-2xl bg-card p-4 shadow-xl ring-1 ring-foreground/10 sm:bottom-12 sm:left-16 sm:w-64"
        style={{ animationDelay: "300ms" }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Dr. Meera Sharma</p>
            <p className="text-xs text-muted-foreground">Wed, 18:00 &middot; Noida</p>
          </div>
          <CalendarCheck className="size-4 shrink-0 text-primary" />
        </div>
        <div className="mt-3">
          <StatusBadge status="confirmed" />
        </div>
      </div>
    </div>
  );
}
