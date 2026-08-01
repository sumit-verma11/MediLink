import { HeartbeatBackground } from "@/components/ui/heartbeat-background";
import { FloatingIcon3D } from "@/components/ui/floating-icon-3d";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
      <div className="flex items-center justify-center p-6">{children}</div>
      <div className="glass-panel relative hidden items-center justify-center overflow-hidden bg-primary/5 p-6 md:flex">
        <HeartbeatBackground />
        <div className="relative flex flex-col items-center gap-4">
          <FloatingIcon3D src="/icons-3d/stethoscope.png" size={140} alt="" />
          <p className="max-w-xs text-center text-lg font-medium text-primary">
            Care, connected.
          </p>
        </div>
      </div>
    </div>
  );
}
