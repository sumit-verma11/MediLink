import { cn } from '@/lib/utils';

// Sibling to StatusBadge, not a repurposing of it -- StatusBadge's palette is
// keyed by appointment/referral/prescription status strings; this badge always
// means one thing ("this row came from the AI suggestion panel, not the doctor
// typing"), so it gets its own fixed accent styling rather than a lookup table.
export function AiSuggestionBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent', className)}>
      AI
    </span>
  );
}
