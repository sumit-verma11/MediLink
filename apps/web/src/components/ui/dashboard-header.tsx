import { FloatingIcon3D } from './floating-icon-3d';

export function DashboardHeader({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-border bg-gradient-to-br from-primary/8 via-card to-accent/8 p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <FloatingIcon3D src={icon} size={112} alt="" />
        </div>
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-3">{children}</div> : null}
    </div>
  );
}
