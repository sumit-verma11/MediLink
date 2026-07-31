import { DashboardAnimation } from '@/components/ui/dashboard-animation';

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <DashboardAnimation path="/animations/empty-state.json" size={120} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
