export function StatStrip({ stats }: { stats: { value: string | number; label: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
          <p className="font-heading text-3xl font-semibold text-primary">{s.value}</p>
          <p className="text-sm text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
