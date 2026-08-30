import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MapPin, Star, Languages, GraduationCap, MessageSquareQuote } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { BackLink } from '@/components/ui/back-link';
import { cn } from '@/lib/utils';

interface DoctorProfile {
  _id: string;
  userId: { _id: string; name: string; avatarUrl?: string };
  specialties: string[];
  qualifications: string[];
  bio: string;
  clinicName: string;
  clinicAddress: string;
  city: string;
  consultationFee: number;
  languages: string[];
  avgRating: number;
  ratingCount: number;
}

interface DoctorRating {
  score: number;
  text?: string;
  createdAt: string;
}

interface SimilarDoctor {
  _id: string;
  specialties: string[];
  city: string;
  consultationFee: number;
  avgRating: number;
  ratingCount: number;
  userId: { name: string; avatarUrl?: string };
}

// This fetch runs on the Next.js server, not in the browser, so it must reach
// the API by a hostname the server can resolve. Under Docker Compose that is the
// internal service name (`http://api:4000/api`), not the host-mapped localhost
// port the browser uses. Falls back to the public var, then to the local-dev
// default, so `npm run dev` needs no extra configuration.
const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function getDoctor(id: string): Promise<DoctorProfile | null> {
  const res = await fetch(`${API_BASE}/doctors/public/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load doctor');
  const data = await res.json();
  return data.profile;
}

async function getRatings(id: string): Promise<DoctorRating[]> {
  const res = await fetch(`${API_BASE}/ratings/doctor/${id}?limit=6`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items;
}

async function getSimilarDoctors(specialty: string, excludeId: string): Promise<SimilarDoctor[]> {
  const res = await fetch(`${API_BASE}/doctors?specialty=${encodeURIComponent(specialty)}&limit=5`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items as SimilarDoctor[]).filter((d) => d._id !== excludeId).slice(0, 4);
}

export default async function DoctorPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doctor = await getDoctor(id);
  if (!doctor) notFound();

  const [ratings, similarDoctors] = await Promise.all([
    getRatings(id),
    getSimilarDoctors(doctor.specialties[0], id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:px-16">
      <BackLink href="/search" label="Back to search" />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="size-20 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-foreground/10">
          {doctor.userId.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doctor.userId.avatarUrl} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{doctor.userId.name}</h1>
          <p className="mt-1 text-muted-foreground">{doctor.specialties.join(', ')} &middot; {doctor.clinicName}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {doctor.city}
            </span>
            {doctor.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-accent text-accent" /> {doctor.avgRating.toFixed(1)} ({doctor.ratingCount} reviews)
              </span>
            ) : (
              <span>No reviews yet</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <p className="text-2xl font-semibold text-foreground">₹{doctor.consultationFee}</p>
          <Link
            href={`/doctors/${doctor._id}/book`}
            className={cn(buttonVariants({ variant: 'accent', size: 'lg' }))}
          >
            Book appointment
          </Link>
        </div>
      </div>

      <Card className="mt-8">
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-foreground">{doctor.bio}</p>
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="flex items-start gap-2">
              <GraduationCap className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Qualifications</p>
                <p className="text-sm text-foreground">{doctor.qualifications.join(', ')}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Languages className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-muted-foreground">Languages</p>
                <p className="text-sm text-foreground">{doctor.languages.join(', ')}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Clinic address</p>
            <p className="text-sm text-foreground">{doctor.clinicAddress}</p>
          </div>
        </CardContent>
      </Card>

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

      {similarDoctors.length > 0 ? (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">More {doctor.specialties[0]} doctors</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {similarDoctors.map((d, i) => (
              <Link key={d._id} href={`/doctors/${d._id}`}>
                <Card
                  className="animate-fade-up flex-row items-center gap-3 p-4"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="size-11 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-foreground/10">
                    {d.userId.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.userId.avatarUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{d.userId.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.city} &middot; ₹{d.consultationFee}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
