'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, LogOut } from 'lucide-react';
import { useLogoutMutation } from '@/store/authApi';
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = pathname.split('/')[2] ?? 'patient';
  const navItems = NAV_BY_ROLE[role] ?? [];
  const { data: notifData } = useListMyNotificationsQuery();
  const [logout] = useLogoutMutation();

  async function onLogout() {
    await logout().catch(() => undefined);
    router.push('/login');
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
        <div className="flex items-center gap-1">
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
