import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

export default async function DoctorPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doctor = await getDoctor(id);
  if (!doctor) notFound();

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <FloatingIcon3D src="/icons-3d/stethoscope.png" size={160} alt="" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{doctor.clinicName}</h1>
          <p className="text-muted-foreground">{doctor.specialties.join(', ')} · {doctor.city}</p>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-2">
          <p>{doctor.bio}</p>
          <p>Qualifications: {doctor.qualifications.join(', ')}</p>
          <p>Languages: {doctor.languages.join(', ')}</p>
          <p>Consultation fee: ₹{doctor.consultationFee}</p>
          <p>Rating: {doctor.avgRating.toFixed(1)} ({doctor.ratingCount} reviews)</p>
        </CardContent>
      </Card>
      <Button nativeButton={false} render={<Link href={`/doctors/${doctor._id}/book`} />}>
        Book appointment
      </Button>
    </main>
  );
}
