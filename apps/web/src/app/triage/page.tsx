'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSendTriageMessageMutation } from '@/store/triageApi';
import type { TriageSession } from '@/store/triageApi';
import { useGetPublicDoctorProfileQuery } from '@/store/doctorsApi';

function RecommendedDoctorCard({ doctorId, triageSessionId }: { doctorId: string; triageSessionId: string }) {
  const { data, isLoading, isError } = useGetPublicDoctorProfileQuery(doctorId);

  if (isLoading) {
    return <div className="border p-3 rounded text-sm text-gray-500">Loading doctor…</div>;
  }

  if (isError || !data) {
    // Graceful degradation: still let the patient book even if the profile
    // fetch fails, rather than hiding the recommendation entirely.
    return (
      <div className="border p-3 rounded flex justify-between items-center">
        <span className="text-sm text-gray-500">Doctor details unavailable</span>
        <Link className="underline text-sm" href={`/doctors/${doctorId}/book?triageSessionId=${triageSessionId}`}>
          Book with this doctor →
        </Link>
      </div>
    );
  }

  const { profile } = data;

  return (
    <div className="border p-3 rounded space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="font-medium">{profile.userId.name}</span>
        <span className="text-sm text-gray-600">{profile.avgRating.toFixed(1)} ★ ({profile.ratingCount})</span>
      </div>
      <p className="text-sm text-gray-600">
        {profile.specialties.join(', ')} · {profile.city} · ₹{profile.consultationFee}
      </p>
      <Link className="underline text-sm" href={`/doctors/${doctorId}/book?triageSessionId=${triageSessionId}`}>
        Book with this doctor →
      </Link>
    </div>
  );
}

export default function TriagePage() {
  const [input, setInput] = useState('');
  const [session, setSession] = useState<TriageSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendMessage, { isLoading }] = useSendTriageMessageMutation();

  async function onSend() {
    if (isLoading || !input.trim()) return;
    try {
      const { session: updated } = await sendMessage({ text: input, sessionId: session?._id }).unwrap();
      setSession(updated);
      setInput('');
      setError(null);
    } catch {
      setError('Something went wrong — please try again.');
    }
  }

  return (
    <main className="max-w-2xl mx-auto mt-12 space-y-4">
      <h1 className="text-2xl font-bold">Describe your symptoms</h1>
      <p className="text-sm text-gray-600">This is guidance, not medical advice.</p>

      <div className="space-y-2">
        {session?.messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <p className={`inline-block px-3 py-2 rounded ${m.role === 'user' ? 'bg-black text-white' : 'bg-gray-100'}`}>
              {m.text}
            </p>
          </div>
        ))}
      </div>

      {session?.isRedFlag ? (
        <div className="bg-red-600 text-white p-4 rounded font-bold">
          This may be a medical emergency. Seek emergency care immediately or call 112.
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              className="border p-2 flex-1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              disabled={isLoading}
              placeholder="e.g. itchy red patches on my elbow for 2 weeks"
            />
            <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSend}>
              Send
            </button>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {session && session.suggestedSpecialties.length > 0 ? (
            <div className="space-y-2">
              <h2 className="font-semibold">Suggested specialties</h2>
              {session.suggestedSpecialties.map((s) => (
                <div key={s.name} className="border p-3 rounded flex justify-between items-center">
                  <span>{s.name} ({Math.round(s.confidence * 100)}% match)</span>
                </div>
              ))}
              <div className="space-y-2">
                {session.recommendedDoctorIds.map((doctorId) => (
                  <RecommendedDoctorCard key={doctorId} doctorId={doctorId} triageSessionId={session._id} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
