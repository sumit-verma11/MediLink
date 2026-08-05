'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchDoctorsQuery, useSearchLabsQuery } from '@/store/searchApi';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function SearchPage() {
  const [doctorFilters, setDoctorFilters] = useState({ name: '', specialty: '', city: '' });
  const [labFilters, setLabFilters] = useState({ testName: '', city: '' });
  const { data: doctorResults } = useSearchDoctorsQuery(doctorFilters);
  const { data: labResults } = useSearchLabsQuery(labFilters);

  return (
    <main className="w-full mt-12 space-y-8 px-8">
      <div className="space-y-2">
        <h1 className="font-heading text-4xl font-semibold">Search</h1>
        <p className="max-w-2xl text-muted-foreground">
          Find an approved doctor by name, specialty, or city, or find a lab that runs the specific test you need.
          Every profile below has already cleared MedLink&apos;s verification review.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Doctors</h2>
        <div className="flex gap-2">
          <Input placeholder="Name" value={doctorFilters.name} onChange={(e) => setDoctorFilters({ ...doctorFilters, name: e.target.value })} />
          <Input placeholder="Specialty" value={doctorFilters.specialty} onChange={(e) => setDoctorFilters({ ...doctorFilters, specialty: e.target.value })} />
          <Input placeholder="City" value={doctorFilters.city} onChange={(e) => setDoctorFilters({ ...doctorFilters, city: e.target.value })} />
        </div>
        {doctorResults?.items.length === 0 ? <EmptyState icon="/icons-3d/stethoscope.png" message="No doctors match." hint="Try clearing a filter or searching a nearby city." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {doctorResults?.items.map((d) => (
            <Link key={d._id} href={`/doctors/${d._id}`}>
              <Card className="h-full">
                <CardContent className="flex items-center gap-4">
                  <img
                    src={d.userId.avatarUrl || `https://i.pravatar.cc/150?u=${d._id}`}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 shrink-0 rounded-full object-cover ring-2 ring-primary/10"
                  />
                  <div>
                    <p className="font-medium">{d.userId.name}</p>
                    <p className="text-sm text-muted-foreground">{d.specialties.join(', ')} · {d.city}</p>
                    <p className="text-sm text-muted-foreground">₹{d.consultationFee} · {d.avgRating.toFixed(1)}★ ({d.ratingCount})</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold">Labs</h2>
        <div className="flex gap-2">
          <Input placeholder="Test name" value={labFilters.testName} onChange={(e) => setLabFilters({ ...labFilters, testName: e.target.value })} />
          <Input placeholder="City" value={labFilters.city} onChange={(e) => setLabFilters({ ...labFilters, city: e.target.value })} />
        </div>
        {labResults?.items.length === 0 ? <EmptyState icon="/icons-3d/test-tube.png" message="No labs match." hint="Try a different test name or city." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {labResults?.items.map((l) => (
            <Link key={l._id} href={`/labs/${l._id}`}>
              <Card className="h-full">
                <CardContent className="flex items-center gap-4">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-verified/10 text-verified font-heading text-lg">
                    {l.labName.slice(0, 1)}
                  </div>
                  <div>
                    <p className="font-medium">{l.labName}</p>
                    <p className="text-sm text-muted-foreground">{l.city}{l.homeCollection ? ' · Home collection available' : ''}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
