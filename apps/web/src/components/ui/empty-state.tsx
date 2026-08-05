import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';

export function EmptyState({ icon, message, hint }: { icon: string; message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <FloatingIcon3D src={icon} size={112} alt="" />
      <div className="space-y-1">
        <p className="font-medium">{message}</p>
        {hint ? <p className="max-w-xs text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
