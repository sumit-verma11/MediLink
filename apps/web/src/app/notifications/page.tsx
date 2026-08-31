'use client';

import { useState } from 'react';
import { Bell, Send } from 'lucide-react';
import { useListMyNotificationsQuery, useMarkNotificationReadMutation } from '@/store/notificationsApi';
import { useGenerateTelegramLinkCodeMutation, useUnlinkTelegramMutation } from '@/store/telegramApi';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// No GET /api/telegram/link status endpoint exists (or is needed) -- this card only
// needs to show the freshly generated deep link once per click, not persist a
// linked/unlinked state across reloads. See docs/superpowers/specs/
// 2026-08-09-phase7-telegram-notifications-design.md §8.
function TelegramLinkCard() {
  const [generate, { data, isLoading: isGenerating }] = useGenerateTelegramLinkCodeMutation();
  const [unlink, { isLoading: isUnlinking }] = useUnlinkTelegramMutation();
  const [unlinked, setUnlinked] = useState(false);

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
            <Send className="size-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Telegram notifications</p>
            {data && !unlinked ? (
              <a
                href={data.deepLink}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                Open Telegram to finish connecting
              </a>
            ) : (
              <p className="text-xs text-muted-foreground">Get appointment and lab updates as Telegram messages.</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" disabled={isGenerating} onClick={() => generate()}>
            {data && !unlinked ? 'Regenerate link' : 'Connect Telegram'}
          </Button>
          <button
            type="button"
            disabled={isUnlinking}
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            onClick={async () => {
              await unlink().unwrap();
              setUnlinked(true);
            }}
          >
            Disconnect
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NotificationsPage() {
  const { data, isLoading, refetch } = useListMyNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 md:px-16">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 md:px-16">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notifications</h1>
        <p className="mt-1 text-muted-foreground">Updates on your appointments, referrals, and reports.</p>
      </div>

      <TelegramLinkCard />

      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No notifications yet." /> : null}

      <div className="space-y-2">
        {data?.items.map((n) => (
          <Card key={n._id} className={cn(!n.readAt && 'ring-1 ring-primary/30')}>
            <CardContent className="flex items-start gap-3">
              <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', n.readAt ? 'bg-secondary' : 'bg-accent/20')}>
                <Bell className={cn('size-4', n.readAt ? 'text-muted-foreground' : 'text-accent')} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{n.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                <div className="mt-2 flex gap-4">
                  {n.link ? (
                    <a href={n.link} className="text-xs font-medium text-foreground underline underline-offset-2">
                      Open
                    </a>
                  ) : null}
                  {!n.readAt ? (
                    <button
                      className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      onClick={async () => {
                        await markRead(n._id).unwrap();
                        refetch();
                      }}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
