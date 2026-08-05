import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-amber-100 text-amber-800',
  sent: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-primary/10 text-primary',
  opened: 'bg-primary/10 text-primary',
  booked: 'bg-primary/10 text-primary',
  sample_collected: 'bg-primary/10 text-primary',
  approved: 'bg-primary/10 text-primary',
  completed: 'bg-verified/10 text-verified',
  report_ready: 'bg-verified/10 text-verified',
  closed: 'bg-verified/10 text-verified',
  rejected: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-destructive/10 text-destructive',
  no_show: 'bg-destructive/10 text-destructive',
};

const STATUS_ACCENT_BORDERS: Record<string, string> = {
  requested: 'border-l-amber-400',
  sent: 'border-l-amber-400',
  confirmed: 'border-l-primary',
  opened: 'border-l-primary',
  booked: 'border-l-primary',
  sample_collected: 'border-l-primary',
  approved: 'border-l-primary',
  completed: 'border-l-verified',
  report_ready: 'border-l-verified',
  closed: 'border-l-verified',
  rejected: 'border-l-destructive',
  cancelled: 'border-l-destructive',
  no_show: 'border-l-destructive',
};

// A left-border accent color matching StatusBadge's bucket, for cards that
// want a stronger at-a-glance color cue than the badge pill alone provides.
export function statusAccentClass(status: string): string {
  return cn('border-l-4', STATUS_ACCENT_BORDERS[status] ?? 'border-l-border');
}

function formatStatusLabel(status: string): string {
  const spaced = status.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-medium', style)}>
      {formatStatusLabel(status)}
    </span>
  );
}
