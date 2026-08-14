'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Star, MapPin, Home, FlaskConical } from 'lucide-react';
import { useSearchDoctorsQuery, useSearchLabsQuery } from '@/store/searchApi';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SPECIALTIES = [
  'Dermatology',
  'General Physician',
  'Gastroenterology',
  'Cardiology',
  'Gynecology',
  'Orthopedics',
  'Pediatrics',
  'ENT',
  'Psychiatry',
  'Ophthalmology',
];

const CITIES = ['Noida', 'Delhi', 'Ghaziabad'];

export default function SearchPage() {
  const [doctorFilters, setDoctorFilters] = useState({ name: '', specialty: '', city: '' });
  const [labFilters, setLabFilters] = useState({ testName: '', city: '' });
  const { data: doctorResults } = useSearchDoctorsQuery({ ...doctorFilters, limit: 50 });
  const { data: labResults } = useSearchLabsQuery(labFilters);

  return (
    <main className="flex flex-1 flex-col">
      <div className="border-b border-border bg-card px-6 py-16 md:px-16">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Find doctors &amp; labs</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Filter by specialty, city, or the test you need. Every profile shown here is a real, bookable listing.
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-12 px-6 py-12 md:px-16">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-foreground">Doctors</h2>
            {doctorResults ? (
              <p className="text-xs text-muted-foreground">
                Showing {doctorResults.items.length} of {doctorResults.total}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SPECIALTIES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDoctorFilters({ ...doctorFilters, specialty: doctorFilters.specialty === s ? '' : s })}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  doctorFilters.specialty === s
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDoctorFilters({ ...doctorFilters, city: doctorFilters.city === c ? '' : c })}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  doctorFilters.city === c
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                <MapPin className="size-3" /> {c}
              </button>
            ))}
          </div>

          <Input
            placeholder="Search by name"
            value={doctorFilters.name}
            onChange={(e) => setDoctorFilters({ ...doctorFilters, name: e.target.value })}
          />

          <div className="space-y-2">
            {doctorResults?.items.map((d, i) => (
              <Link key={d._id} href={`/doctors/${d._id}`} className="block">
                <Card
                  className="animate-fade-up flex-row items-center gap-4 p-4"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="size-12 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-foreground/10">
                    {d.userId.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.userId.avatarUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{d.userId.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.specialties.join(', ')} &middot; <MapPin className="inline size-3 -translate-y-px" /> {d.city}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">₹{d.consultationFee}</p>
                    <p className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                      <Star className="size-3 fill-accent text-accent" /> {d.avgRating.toFixed(1)} ({d.ratingCount})
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
            {doctorResults?.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No doctors match. Try clearing a filter.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Labs</h2>

          <div className="flex flex-wrap gap-1.5">
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setLabFilters({ ...labFilters, city: labFilters.city === c ? '' : c })}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  labFilters.city === c
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                <MapPin className="size-3" /> {c}
              </button>
            ))}
          </div>

          <Input
            placeholder="Search by test name (e.g. CBC, Lipid Profile)"
            value={labFilters.testName}
            onChange={(e) => setLabFilters({ ...labFilters, testName: e.target.value })}
          />

          <div className="space-y-2">
            {labResults?.items.map((l, i) => (
              <Link key={l._id} href={`/labs/${l._id}`} className="block">
                <Card
                  className="animate-fade-up flex-row items-center gap-4 p-4"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <FlaskConical className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{l.labName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <MapPin className="inline size-3 -translate-y-px" /> {l.city} &middot; {l.tests.length} tests
                    </p>
                  </div>
                  {l.homeCollection ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                      <Home className="size-3" /> Home collection
                    </span>
                  ) : null}
                </Card>
              </Link>
            ))}
            {labResults?.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No labs match. Try clearing a filter.</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
