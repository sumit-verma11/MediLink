'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSendTriageMessageMutation } from '@/store/triageApi';
import type { TriageSession } from '@/store/triageApi';

export default function TriagePage() {
  const [input, setInput] = useState('');
  const [session, setSession] = useState<TriageSession | null>(null);
  const [sendMessage, { isLoading }] = useSendTriageMessageMutation();

  async function onSend() {
    if (!input.trim()) return;
    const { session: updated } = await sendMessage({ text: input, sessionId: session?._id }).unwrap();
    setSession(updated);
    setInput('');
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
              placeholder="e.g. itchy red patches on my elbow for 2 weeks"
            />
            <button className="bg-black text-white px-4 py-2" disabled={isLoading} onClick={onSend}>
              Send
            </button>
          </div>

          {session && session.suggestedSpecialties.length > 0 ? (
            <div className="space-y-2">
              <h2 className="font-semibold">Suggested specialties</h2>
              {session.suggestedSpecialties.map((s) => (
                <div key={s.name} className="border p-3 rounded flex justify-between items-center">
                  <span>{s.name} ({Math.round(s.confidence * 100)}% match)</span>
                </div>
              ))}
              <div className="space-y-1">
                {session.recommendedDoctorIds.map((doctorId) => (
                  <Link
                    key={doctorId}
                    className="block underline"
                    href={`/doctors/${doctorId}/book?triageSessionId=${session._id}`}
                  >
                    Book with this doctor →
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
