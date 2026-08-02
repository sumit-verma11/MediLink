import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface LabTest {
  code: string;
  name: string;
  price: number;
  turnaroundHours: number;
}

interface LabProfile {
  _id: string;
  labName: string;
  address: string;
  city: string;
  timings: string;
  homeCollection: boolean;
  tests: LabTest[];
}

// This fetch runs on the Next.js server, not in the browser, so it must reach
// the API by a hostname the server can resolve. Under Docker Compose that is the
// internal service name (`http://api:4000/api`), not the host-mapped localhost
// port the browser uses. Falls back to the public var, then to the local-dev
// default, so `npm run dev` needs no extra configuration.
const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function getLab(id: string): Promise<LabProfile | null> {
  const res = await fetch(`${API_BASE}/labs/public/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load lab');
  const data = await res.json();
  return data.profile;
}

export default async function LabPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lab = await getLab(id);
  if (!lab) notFound();

  return (
    <main className="max-w-3xl mx-auto mt-12 px-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <FloatingIcon3D src="/icons-3d/test-tube.png" size={160} alt="" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">{lab.labName}</h1>
          <p className="text-muted-foreground">{lab.address}, {lab.city}</p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-2">
          <p>Timings: {lab.timings}</p>
          <p>Home collection: {lab.homeCollection ? 'Available' : 'Not available'}</p>
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1">Test</th>
                <th className="py-1">Price</th>
                <th className="py-1">TAT</th>
              </tr>
            </thead>
            <tbody>
              {lab.tests.map((t) => (
                <tr key={t.code} className="border-b">
                  <td className="py-1">{t.name}</td>
                  <td className="py-1">₹{t.price}</td>
                  <td className="py-1">{t.turnaroundHours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Button nativeButton={false} render={<Link href={`/labs/${lab._id}/book`} />}>
        Book a test
      </Button>
    </main>
  );
}
