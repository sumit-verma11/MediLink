'use client';

import { useListMyNotificationsQuery, useMarkNotificationReadMutation } from '@/store/notificationsApi';

export default function NotificationsPage() {
  const { data, isLoading, refetch } = useListMyNotificationsQuery();
  const [markRead] = useMarkNotificationReadMutation();

  if (isLoading) return <main className="max-w-2xl mx-auto mt-12">Loading…</main>;

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">Notifications</h1>
      {data?.items.map((n) => (
        <div key={n._id} className={`border p-3 rounded ${n.readAt ? '' : 'bg-blue-50'}`}>
          <p className="font-semibold">{n.title}</p>
          <p className="text-sm text-gray-600">{n.body}</p>
          <div className="flex gap-3 mt-1">
            {n.link ? <a href={n.link} className="text-sm underline">Open</a> : null}
            {!n.readAt ? (
              <button
                className="text-sm underline"
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
      ))}
      {data?.items.length === 0 ? <p className="text-sm text-gray-600">No notifications yet.</p> : null}
    </main>
  );
}
