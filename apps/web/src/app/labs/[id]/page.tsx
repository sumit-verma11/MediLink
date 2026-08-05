import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Clock, Home, MapPin, FlaskConical } from 'lucide-react';
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
          <h1 className="font-heading text-4xl font-semibold">{lab.labName}</h1>
          <p className="text-muted-foreground">{lab.address}, {lab.city}</p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-xl font-semibold">About</h2>
          <p className="text-base text-muted-foreground">
            {lab.labName} runs a catalog of {lab.tests.length} diagnostic tests out of {lab.city}
            {lab.homeCollection ? ', with home sample collection available for patients who can’t travel in.' : '.'}
            {' '}Reports are uploaded straight to your MedLink health timeline as soon as they&apos;re ready, whether you
            arrived via a doctor&apos;s referral or booked directly.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-2">
            <MapPin className="size-5 text-primary" />
            <p className="font-medium">Location</p>
            <p className="text-sm text-muted-foreground">{lab.address}, {lab.city}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <Clock className="size-5 text-primary" />
            <p className="font-medium">Timings</p>
            <p className="text-sm text-muted-foreground">{lab.timings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <Home className="size-5 text-primary" />
            <p className="font-medium">Home collection</p>
            <p className="text-sm text-muted-foreground">{lab.homeCollection ? 'Available' : 'Not available'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">Test catalog</h2>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Test</th>
                <th className="py-2">Code</th>
                <th className="py-2">Price</th>
                <th className="py-2">TAT</th>
              </tr>
            </thead>
            <tbody>
              {lab.tests.map((t) => (
                <tr key={t.code} className="border-b last:border-0">
                  <td className="py-2">{t.name}</td>
                  <td className="py-2 font-mono text-sm text-muted-foreground">{t.code}</td>
                  <td className="py-2">₹{t.price}</td>
                  <td className="py-2 text-muted-foreground">{t.turnaroundHours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Button size="lg" nativeButton={false} render={<Link href={`/labs/${lab._id}/book`} />}>
        Book a test
      </Button>
    </main>
  );
}
