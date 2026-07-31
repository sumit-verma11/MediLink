'use client';

import { useState } from 'react';
import { useSearchDoctorsQuery, useSearchLabsQuery } from '@/store/searchApi';

export default function SearchPage() {
  const [doctorFilters, setDoctorFilters] = useState({ name: '', specialty: '', city: '' });
  const [labFilters, setLabFilters] = useState({ testName: '', city: '' });
  const { data: doctorResults } = useSearchDoctorsQuery(doctorFilters);
  const { data: labResults } = useSearchLabsQuery(labFilters);

  return (
    <main className="max-w-3xl mx-auto mt-12 space-y-8">
      <h1 className="text-2xl font-bold">Search</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Doctors</h2>
        <div className="flex gap-2">
          <input className="border rounded p-2" placeholder="Name" value={doctorFilters.name} onChange={(e) => setDoctorFilters({ ...doctorFilters, name: e.target.value })} />
          <input className="border rounded p-2" placeholder="Specialty" value={doctorFilters.specialty} onChange={(e) => setDoctorFilters({ ...doctorFilters, specialty: e.target.value })} />
          <input className="border rounded p-2" placeholder="City" value={doctorFilters.city} onChange={(e) => setDoctorFilters({ ...doctorFilters, city: e.target.value })} />
        </div>
        {doctorResults?.items.map((d) => (
          <a key={d._id} href={`/doctors/${d._id}`} className="block border p-3 rounded">
            {d.userId.name} — {d.specialties.join(', ')} — {d.city} — ₹{d.consultationFee} — {d.avgRating.toFixed(1)}★ ({d.ratingCount})
          </a>
        ))}
        {doctorResults?.items.length === 0 ? <p className="text-sm text-gray-600">No doctors match.</p> : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Labs</h2>
        <div className="flex gap-2">
          <input className="border rounded p-2" placeholder="Test name" value={labFilters.testName} onChange={(e) => setLabFilters({ ...labFilters, testName: e.target.value })} />
          <input className="border rounded p-2" placeholder="City" value={labFilters.city} onChange={(e) => setLabFilters({ ...labFilters, city: e.target.value })} />
        </div>
        {labResults?.items.map((l) => (
          <a key={l._id} href={`/labs/${l._id}`} className="block border p-3 rounded">
            {l.labName} — {l.city}{l.homeCollection ? ' (home collection)' : ''}
          </a>
        ))}
        {labResults?.items.length === 0 ? <p className="text-sm text-gray-600">No labs match.</p> : null}
      </section>
    </main>
  );
}
