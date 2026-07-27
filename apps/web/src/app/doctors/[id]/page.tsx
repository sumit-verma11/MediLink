import { notFound } from 'next/navigation';

interface DoctorProfile {
  _id: string;
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

async function getDoctor(id: string): Promise<DoctorProfile | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/doctors/public/${id}`, { cache: 'no-store' });
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
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">{doctor.clinicName}</h1>
      <p className="text-gray-600">{doctor.specialties.join(', ')} · {doctor.city}</p>
      <p>{doctor.bio}</p>
      <p>Qualifications: {doctor.qualifications.join(', ')}</p>
      <p>Languages: {doctor.languages.join(', ')}</p>
      <p>Consultation fee: ₹{doctor.consultationFee}</p>
      <p>Rating: {doctor.avgRating.toFixed(1)} ({doctor.ratingCount} reviews)</p>
    </main>
  );
}
