'use client';

import { useListMyNotificationsQuery, useMarkNotificationReadMutation } from '@/store/notificationsApi';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotificationsPage() {
  const { data, isLoading, refetch } = useListMyNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="w-full mt-12 space-y-4 px-8">
      <h1 className="font-heading text-4xl font-semibold">Notifications</h1>
      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No notifications yet." /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.items.map((n) => (
          <Card key={n._id} className={n.readAt ? '' : 'bg-primary/5'}>
            <CardContent className="space-y-2">
              <p className="font-semibold">{n.title}</p>
              <p className="text-sm text-muted-foreground">{n.body}</p>
              <div className="flex gap-3">
                {n.link ? (
                  <Button size="sm" variant="outline" nativeButton={false} render={<a href={n.link} />}>
                    Open
                  </Button>
                ) : null}
                {!n.readAt ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await markRead(n._id).unwrap();
                      } catch {
                        /* a losing race just leaves the notification as-is on refetch */
                      }
                      refetch();
                    }}
                  >
                    Mark read
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
