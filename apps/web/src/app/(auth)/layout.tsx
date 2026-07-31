import { HeartbeatBackground } from "@/components/ui/heartbeat-background";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
      <div className="flex items-center justify-center p-6">{children}</div>
      <div className="relative hidden items-center justify-center overflow-hidden bg-primary/5 p-6 md:flex">
        <HeartbeatBackground />
        <p className="relative max-w-xs text-center text-lg font-medium text-primary">
          Care, connected.
        </p>
      </div>
    </div>
  );
}
