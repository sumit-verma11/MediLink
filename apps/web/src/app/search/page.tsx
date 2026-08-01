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
    <main className="max-w-5xl mx-auto mt-12 space-y-8 px-6">
      <h1 className="text-2xl font-bold">Search</h1>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Doctors</h2>
        <div className="flex gap-2">
          <Input placeholder="Name" value={doctorFilters.name} onChange={(e) => setDoctorFilters({ ...doctorFilters, name: e.target.value })} />
          <Input placeholder="Specialty" value={doctorFilters.specialty} onChange={(e) => setDoctorFilters({ ...doctorFilters, specialty: e.target.value })} />
          <Input placeholder="City" value={doctorFilters.city} onChange={(e) => setDoctorFilters({ ...doctorFilters, city: e.target.value })} />
        </div>
        {doctorResults?.items.length === 0 ? <EmptyState icon="/icons-3d/stethoscope.png" message="No doctors match." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {doctorResults?.items.map((d) => (
            <Link key={d._id} href={`/doctors/${d._id}`}>
              <Card className="h-full">
                <CardContent>
                  {d.userId.name} — {d.specialties.join(', ')} — {d.city} — ₹{d.consultationFee} — {d.avgRating.toFixed(1)}★ ({d.ratingCount})
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Labs</h2>
        <div className="flex gap-2">
          <Input placeholder="Test name" value={labFilters.testName} onChange={(e) => setLabFilters({ ...labFilters, testName: e.target.value })} />
          <Input placeholder="City" value={labFilters.city} onChange={(e) => setLabFilters({ ...labFilters, city: e.target.value })} />
        </div>
        {labResults?.items.length === 0 ? <EmptyState icon="/icons-3d/test-tube.png" message="No labs match." /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {labResults?.items.map((l) => (
            <Link key={l._id} href={`/labs/${l._id}`}>
              <Card className="h-full">
                <CardContent>
                  {l.labName} — {l.city}{l.homeCollection ? ' (home collection)' : ''}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
