'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSendTriageMessageMutation } from '@/store/triageApi';
import type { TriageSession } from '@/store/triageApi';
import { useGetPublicDoctorProfileQuery } from '@/store/doctorsApi';
import { FloatingIcon3D } from '@/components/ui/floating-icon-3d';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function RecommendedDoctorCard({ doctorId, triageSessionId }: { doctorId: string; triageSessionId: string }) {
  const { data, isLoading, isError } = useGetPublicDoctorProfileQuery(doctorId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">Loading doctor…</CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    // Graceful degradation: still let the patient book even if the profile
    // fetch fails, rather than hiding the recommendation entirely.
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Doctor details unavailable</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/doctors/${doctorId}/book?triageSessionId=${triageSessionId}`} />}>
            Book with this doctor →
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { profile } = data;

  return (
    <Card>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{profile.userId.name}</span>
          <span className="text-sm text-muted-foreground">{profile.avgRating.toFixed(1)} ★ ({profile.ratingCount})</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {profile.specialties.join(', ')} · {profile.city} · ₹{profile.consultationFee}
        </p>
        <Button size="sm" nativeButton={false} render={<Link href={`/doctors/${doctorId}/book?triageSessionId=${triageSessionId}`} />}>
          Book with this doctor →
        </Button>
      </CardContent>
    </Card>
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
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <FloatingIcon3D src="/icons-3d/stethoscope.png" size={160} alt="" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Describe your symptoms</h1>
          <p className="text-sm text-muted-foreground">This is guidance, not medical advice.</p>
        </div>
      </div>

      {session?.messages.length ? (
        <div className="space-y-2">
          {session.messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <p
                className={`inline-block rounded-lg px-3 py-2 text-sm ${
                  m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {session?.isRedFlag ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="font-bold text-destructive">
            This may be a medical emergency. Seek emergency care immediately or call 112.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              className="h-10"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              disabled={isLoading}
              placeholder="e.g. itchy red patches on my elbow for 2 weeks"
            />
            <Button disabled={isLoading} onClick={onSend}>
              Send
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {session && session.suggestedSpecialties.length > 0 ? (
            <div className="space-y-2">
              <h2 className="font-semibold">Suggested specialties</h2>
              {session.suggestedSpecialties.map((s) => (
                <Card key={s.name}>
                  <CardContent>
                    {s.name} ({Math.round(s.confidence * 100)}% match)
                  </CardContent>
                </Card>
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
