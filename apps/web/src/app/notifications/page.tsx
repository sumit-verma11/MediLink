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
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Notifications</h1>
      {data?.items.length === 0 ? <EmptyState icon="/icons-3d/bell.png" message="No notifications yet." /> : null}
      <div className="space-y-2">
        {data?.items.map((n) => (
          <Card key={n._id} className={n.readAt ? '' : 'bg-primary/5'}>
            <CardContent className="space-y-1">
              <p className="font-semibold">{n.title}</p>
              <p className="text-sm text-muted-foreground">{n.body}</p>
              <div className="mt-1 flex gap-3">
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
                      await markRead(n._id).unwrap();
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
