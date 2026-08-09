import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  sent: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-primary/10 text-primary',
  opened: 'bg-primary/10 text-primary',
  booked: 'bg-primary/10 text-primary',
  sample_collected: 'bg-primary/10 text-primary',
  approved: 'bg-primary/10 text-primary',
  completed: 'bg-green-100 text-green-800',
  report_ready: 'bg-green-100 text-green-800',
  closed: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-100 text-red-800',
  no_show: 'bg-red-100 text-red-800',
};

function formatStatusLabel(status: string): string {
  const spaced = status.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', style)}>
      {formatStatusLabel(status)}
    </span>
  );
}
