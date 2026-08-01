import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <FloatingIcon3D src={icon} size={96} alt="" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
