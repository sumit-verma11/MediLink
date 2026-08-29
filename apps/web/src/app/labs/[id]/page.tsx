import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Clock, Home, FlaskConical, Star, MessageSquareQuote } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { BackLink } from '@/components/ui/back-link';
import { cn } from '@/lib/utils';

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
  avgRating: number;
  ratingCount: number;
}

interface OtherLab {
  _id: string;
  labName: string;
  city: string;
  homeCollection: boolean;
  tests: { code: string }[];
}

interface LabRating {
  score: number;
  text?: string;
  createdAt: string;
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

async function getOtherLabs(excludeId: string): Promise<OtherLab[]> {
  const res = await fetch(`${API_BASE}/labs?limit=5`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items as OtherLab[]).filter((l) => l._id !== excludeId).slice(0, 3);
}

async function getRatings(id: string): Promise<LabRating[]> {
  const res = await fetch(`${API_BASE}/ratings/lab/${id}?limit=6`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items;
}

// Composed from fields the profile already has, rather than a separate
// "description" field on the model -- one more thing to keep in sync for a
// sentence that's fully derivable from data that's already here.
function describeLab(lab: LabProfile): string {
  const collectionLine = lab.homeCollection
    ? 'Home sample collection is available if you would rather not travel in.'
    : 'Samples are collected on-site during lab hours.';
  return `${lab.labName} is a diagnostics lab in ${lab.city}, running ${lab.tests.length} tests from routine blood work to specialised panels. ${collectionLine} Open ${lab.timings}.`;
}

export default async function LabPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lab = await getLab(id);
  if (!lab) notFound();
  const [otherLabs, ratings] = await Promise.all([getOtherLabs(id), getRatings(id)]);

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-border bg-card px-6 py-16 md:px-16">
        <div className="mx-auto max-w-3xl">
          <BackLink href="/search" label="Back to search" />
        </div>
        <div className="mx-auto flex max-w-3xl flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{lab.labName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {lab.address}, {lab.city}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" /> {lab.timings}
              </span>
              {lab.homeCollection ? (
                <span className="inline-flex items-center gap-1">
                  <Home className="size-3.5" /> Home collection available
                </span>
              ) : null}
              {lab.ratingCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-accent text-accent" /> {lab.avgRating.toFixed(1)} ({lab.ratingCount} reviews)
                </span>
              ) : null}
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-foreground">{describeLab(lab)}</p>
          </div>
          <Link href={`/labs/${lab._id}/book`} className={cn(buttonVariants({ variant: 'accent', size: 'lg' }))}>
            Book a test
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-12 md:px-16">
        <h2 className="text-lg font-semibold text-foreground">Tests offered</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {lab.tests.map((t, i) => (
            <Card key={t.code} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <CardContent className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">Results in {t.turnaroundHours}h</p>
                </div>
                <p className="text-sm font-semibold text-foreground">₹{t.price}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {ratings.length > 0 ? (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">Patient reviews</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {ratings.map((r, i) => (
                <Card key={i} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={cn('size-3.5', n <= r.score ? 'fill-accent text-accent' : 'text-border')} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {r.text ? (
                      <p className="flex items-start gap-1.5 text-sm leading-relaxed text-foreground">
                        <MessageSquareQuote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        {r.text}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {otherLabs.length > 0 ? (
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-foreground">Other labs</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {otherLabs.map((l, i) => (
                <Link key={l._id} href={`/labs/${l._id}`}>
                  <Card
                    className="animate-fade-up flex-row items-center gap-3 p-4"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                  >
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <FlaskConical className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{l.labName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.city} &middot; {l.tests.length} tests
                        {l.homeCollection ? ' · home collection' : ''}
                      </p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
