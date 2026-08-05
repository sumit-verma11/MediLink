import { notFound } from 'next/navigation';
import Link from 'next/link';
import { GraduationCap, Award, Languages, IdCard, MapPin, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface DoctorProfile {
  _id: string;
  userId: { _id: string; name: string; avatarUrl?: string };
  specialties: string[];
  qualifications: string[];
  regNo: string;
  experienceYears: number;
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
    <main className="max-w-3xl mx-auto mt-12 px-6 space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={doctor.userId.avatarUrl || `https://i.pravatar.cc/150?u=${doctor.userId._id}`}
            alt={doctor.userId.name}
            width={96}
            height={96}
            className="size-24 shrink-0 rounded-full object-cover ring-4 ring-primary/10"
          />
          <div className="space-y-1">
            <h1 className="font-heading text-3xl font-semibold">{doctor.userId.name}</h1>
            <p className="text-lg text-muted-foreground">{doctor.clinicName}</p>
            <p className="text-muted-foreground">{doctor.specialties.join(', ')}</p>
            <div className="flex items-center gap-1 text-amber-600">
              <Star className="size-4 fill-current" />
              <span className="font-medium">{doctor.avgRating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">({doctor.ratingCount} reviews)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-xl font-semibold">About</h2>
          <p className="text-base text-muted-foreground">{doctor.bio}</p>
          <p className="text-base text-muted-foreground">
            {doctor.userId.name} has been practicing {doctor.specialties.join(' and ')} for {doctor.experienceYears} years,
            seeing patients at {doctor.clinicName} in {doctor.city}. Consultations here are booked directly through
            MedLink, with confirmed slots, prescriptions, and any recommended lab tests all tracked in one place.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-5 text-primary" />
              <span className="font-medium">Qualifications</span>
            </div>
            <p className="font-mono text-sm text-muted-foreground">{doctor.qualifications.join(', ')}</p>
            <div className="flex items-center gap-2">
              <Award className="size-5 text-primary" />
              <span className="font-medium">Experience</span>
            </div>
            <p className="text-sm text-muted-foreground">{doctor.experienceYears} years</p>
            <div className="flex items-center gap-2">
              <IdCard className="size-5 text-primary" />
              <span className="font-medium">Registration</span>
            </div>
            <p className="font-mono text-sm text-muted-foreground">{doctor.regNo}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Languages className="size-5 text-primary" />
              <span className="font-medium">Languages</span>
            </div>
            <p className="text-sm text-muted-foreground">{doctor.languages.join(', ')}</p>
            <div className="flex items-center gap-2">
              <MapPin className="size-5 text-primary" />
              <span className="font-medium">Clinic</span>
            </div>
            <p className="text-sm text-muted-foreground">{doctor.clinicAddress}, {doctor.city}</p>
            <div className="flex items-center gap-2">
              <span className="font-medium">Consultation fee</span>
            </div>
            <p className="text-lg font-semibold text-primary">₹{doctor.consultationFee}</p>
          </CardContent>
        </Card>
      </div>

      <Button size="lg" nativeButton={false} render={<Link href={`/doctors/${doctor._id}/book`} />}>
        Book appointment
      </Button>
    </main>
  );
}
