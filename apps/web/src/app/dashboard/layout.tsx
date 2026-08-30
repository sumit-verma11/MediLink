'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, LogOut } from 'lucide-react';
import { useLogoutMutation, useMeQuery } from '@/store/authApi';
import { useListMyNotificationsQuery } from '@/store/notificationsApi';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_BY_ROLE: Record<string, { label: string; href: string }[]> = {
  patient: [
    { label: 'My appointments', href: '/dashboard/patient' },
    { label: 'Health timeline', href: '/dashboard/patient/timeline' },
    { label: 'Find doctors & labs', href: '/search' },
  ],
  doctor: [
    { label: 'Requests', href: '/dashboard/doctor' },
    { label: 'Referrals sent', href: '/dashboard/doctor/referrals' },
  ],
  lab: [{ label: 'Bookings', href: '/dashboard/lab' }],
  admin: [{ label: 'Verifications', href: '/dashboard/admin' }],
};

export const DASHBOARD_PATH_BY_ROLE: Record<string, string> = {
  patient: '/dashboard/patient',
  doctor: '/dashboard/doctor',
  lab: '/dashboard/lab',
  admin: '/dashboard/admin',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const urlRole = pathname.split('/')[2] ?? 'patient';
  const navItems = NAV_BY_ROLE[urlRole] ?? [];
  const { data: notifData } = useListMyNotificationsQuery();
  const { data: meData, isLoading: meLoading, isError: meError } = useMeQuery();
  const [logout] = useLogoutMutation();

  // The backend infers role from the auth cookie, not from which dashboard route the
  // browser happens to be on -- /dashboard/patient and /dashboard/doctor both just call
  // /appointments/me, which returns doctor-scoped data to a doctor regardless of which
  // page rendered it. Without this check, a doctor visiting /dashboard/patient (a stale
  // link, a second logged-in tab, switching accounts) sees their OWN appointments
  // silently relabeled through the patient dashboard's UI instead of an error -- a
  // correctness bug, not just a rough edge. Bounce to the dashboard that matches who's
  // actually logged in.
  useEffect(() => {
    if (meError) {
      router.replace('/login');
      return;
    }
    if (meData && meData.user.role !== urlRole) {
      router.replace(DASHBOARD_PATH_BY_ROLE[meData.user.role] ?? '/login');
    }
  }, [meData, meError, urlRole, router]);

  async function onLogout() {
    await logout().catch(() => undefined);
    router.push('/login');
  }

  const roleConfirmed = meData && meData.user.role === urlRole;

  if (meLoading || !roleConfirmed) {
    return <div className="min-h-full" aria-hidden />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur-md md:px-10">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
            MedLink
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{meData.user.name}</span>
          <Link
            href="/notifications"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')}
            aria-label="Notifications"
          >
            <Bell className="size-4" />
            {notifData && notifData.unreadCount > 0 ? (
              <span className="absolute right-1 top-1 flex size-2 rounded-full bg-accent" aria-hidden />
            ) : null}
          </Link>
          <button
            onClick={onLogout}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
          >
            <LogOut className="size-4" />
            Log out
          </button>
        </div>
      </header>
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-border/60 px-6 py-2 md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium',
              pathname === item.href ? 'bg-secondary text-foreground' : 'text-muted-foreground'
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex-1 px-6 py-10 md:px-10">{children}</div>
    </div>
  );
}
