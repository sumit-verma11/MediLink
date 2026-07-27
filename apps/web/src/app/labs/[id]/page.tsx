import { notFound } from 'next/navigation';

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

async function getLab(id: string): Promise<LabProfile | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/labs/public/${id}`, { cache: 'no-store' });
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
    <main className="max-w-2xl mx-auto mt-12 space-y-2">
      <h1 className="text-2xl font-bold">{lab.labName}</h1>
      <p className="text-gray-600">{lab.address}, {lab.city}</p>
      <p>Timings: {lab.timings}</p>
      <p>Home collection: {lab.homeCollection ? 'Available' : 'Not available'}</p>
      <table className="w-full mt-4 border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-1">Test</th>
            <th className="py-1">Price</th>
            <th className="py-1">TAT</th>
          </tr>
        </thead>
        <tbody>
          {lab.tests.map((t) => (
            <tr key={t.code} className="border-b">
              <td className="py-1">{t.name}</td>
              <td className="py-1">₹{t.price}</td>
              <td className="py-1">{t.turnaroundHours}h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
