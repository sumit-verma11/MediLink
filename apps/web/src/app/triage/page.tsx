'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Stethoscope, Send, TriangleAlert, Star, MapPin } from 'lucide-react';
import { localizeSpecialtyName } from '@medlink/shared';
import { useSendTriageMessageMutation } from '@/store/triageApi';
import type { TriageSession } from '@/store/triageApi';
import { useGetPublicDoctorProfileQuery } from '@/store/doctorsApi';
import { useMeQuery } from '@/store/authApi';
import { DASHBOARD_PATH_BY_ROLE } from '@/app/dashboard/layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackLink } from '@/components/ui/back-link';
import { cn } from '@/lib/utils';

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
      <CardContent className="flex items-center gap-4">
        <div className="size-11 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-foreground/10">
          {profile.userId.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.userId.avatarUrl} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{profile.userId.name}</span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="size-3 fill-accent text-accent" /> {profile.avgRating.toFixed(1)}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {profile.specialties.join(', ')} &middot; <MapPin className="inline size-3 -translate-y-px" /> {profile.city} &middot; ₹{profile.consultationFee}
          </p>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href={`/doctors/${doctorId}/book?triageSessionId=${triageSessionId}`} />}>
          Book
        </Button>
      </CardContent>
    </Card>
  );
}

const EXAMPLE_PROMPTS = [
  'Itchy red patches on my elbow for 2 weeks',
  'Burning sensation in my stomach after meals',
  'Knee pain when climbing stairs',
  'Sore throat and mild fever since yesterday',
];

export default function TriagePage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [session, setSession] = useState<TriageSession | null>(null);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [error, setError] = useState<string | null>(null);
  const [sendMessage, { isLoading }] = useSendTriageMessageMutation();
  const { data: meData, isLoading: meLoading, isError: meError } = useMeQuery();

  // Triage is patient-only server-side (403 for any other role), but nothing previously
  // stopped a doctor/lab/admin from landing on this page and getting a bare "Something
  // went wrong" from the resulting 403 with no explanation. Bounce to whichever
  // dashboard actually matches who's logged in, mirroring the dashboard layout's guard.
  useEffect(() => {
    if (meError) {
      router.replace('/login');
      return;
    }
    if (meData && meData.user.role !== 'patient') {
      router.replace(DASHBOARD_PATH_BY_ROLE[meData.user.role] ?? '/login');
    }
  }, [meData, meError, router]);

  if (meLoading || !meData || meData.user.role !== 'patient') {
    return <div className="min-h-full" aria-hidden />;
  }

  const activeLanguage = session?.language ?? language;

  async function onSend(text: string = input) {
    if (isLoading || !text.trim()) return;
    try {
      const { session: updated } = await sendMessage({
        text,
        sessionId: session?._id,
        // Language is only meaningful when creating a new session -- once one
        // exists, its own stored language always wins (the backend ignores
        // this field on an existing session too, but not sending it at all
        // keeps the toggle's "disabled after first message" behavior honest).
        ...(session ? {} : { language }),
      }).unwrap();
      setSession(updated);
      setInput('');
      setError(null);
    } catch {
      setError('Something went wrong. Please try again.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16 md:px-16">
      <BackLink href="/dashboard/patient" label="Back to my appointments" />
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Stethoscope className="size-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {activeLanguage === 'hi' ? 'अपने लक्षण बताएं' : 'Describe your symptoms'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeLanguage === 'hi' ? 'यह मार्गदर्शन है, चिकित्सीय सलाह नहीं।' : 'This is guidance, not medical advice.'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={language === 'en' ? 'default' : 'outline'}
          disabled={!!session}
          onClick={() => setLanguage('en')}
        >
          English
        </Button>
        <Button
          size="sm"
          variant={language === 'hi' ? 'default' : 'outline'}
          disabled={!!session}
          onClick={() => setLanguage('hi')}
        >
          हिन्दी
        </Button>
      </div>

      {session?.messages.length ? (
        <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
          {session.messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <p
                className={cn(
                  'inline-block max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  m.role === 'user'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-card text-foreground ring-1 ring-foreground/10'
                )}
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {session?.isRedFlag ? (
        <Card className="border-destructive/40 bg-destructive/10 ring-0">
          <CardContent className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="font-semibold text-destructive">
              {activeLanguage === 'hi'
                ? 'यह एक चिकित्सीय आपातकाल हो सकता है। तुरंत आपातकालीन देखभाल लें या 112 पर कॉल करें।'
                : 'This may be a medical emergency. Seek emergency care immediately or call 112.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              className="h-11"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSend()}
              disabled={isLoading}
              placeholder={
                activeLanguage === 'hi'
                  ? 'जैसे: कोहनी पर 2 हफ्तों से लाल, खुजली वाले दाने'
                  : 'e.g. itchy red patches on my elbow for 2 weeks'
              }
            />
            <Button disabled={isLoading} onClick={() => onSend()} size="lg">
              <Send className="size-4" />
              Send
            </Button>
          </div>

          {!session ? (
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onSend(prompt)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {session?.aiUnavailable ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/search" />}>
              Browse doctors &amp; labs instead →
            </Button>
          ) : null}

          {session && session.suggestedSpecialties.length > 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {activeLanguage === 'hi' ? 'सुझाई गई विशेषज्ञताएं' : 'Suggested specialties'}
                </h2>
                {session.suggestedSpecialties.map((s) => (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-foreground">{localizeSpecialtyName(s.name, session.language)}</span>
                      <span className="text-muted-foreground">{Math.round(s.confidence * 100)}% match</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(s.confidence * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {activeLanguage === 'hi' ? 'सुझाए गए डॉक्टर' : 'Recommended doctors'}
                </h2>
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
