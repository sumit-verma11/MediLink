import Link from "next/link";
import {
  User,
  UserRound,
  FlaskConical,
  ShieldCheck,
  Stethoscope,
  CalendarCheck,
  ClipboardPlus,
  Sparkles,
  FileCheck2,
  Star,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const roleEntries = [
  {
    label: "Patient",
    description: "Get AI-guided triage, book appointments, and track your health timeline.",
    icon: User,
    featured: true,
  },
  {
    label: "Doctor",
    description: "Manage availability, review referrals, and issue prescriptions.",
    icon: UserRound,
  },
  {
    label: "Lab",
    description: "Track referrals from booking through to report upload.",
    icon: FlaskConical,
  },
  {
    label: "Admin",
    description: "Verify doctor and lab credentials, monitor platform activity.",
    icon: ShieldCheck,
  },
];

const steps = [
  {
    label: "Triage",
    description: "Describe your symptoms. AI maps them to the right specialty.",
    icon: Stethoscope,
  },
  {
    label: "Book",
    description: "Pick a matched doctor and an open slot, confirmed instantly.",
    icon: CalendarCheck,
  },
  {
    label: "Prescribe & refer",
    description: "Get a verifiable prescription, with lab referrals when needed.",
    icon: ClipboardPlus,
  },
];

const faqs = [
  {
    question: "Does the AI diagnose me or prescribe medicine?",
    answer:
      "No. The triage engine only maps your described symptoms to a likely specialty and ranks doctors who treat it. Every AI response carries a disclaimer that this is guidance, not medical advice, and only a licensed doctor on the platform can write a prescription.",
  },
  {
    question: "What happens if I describe an emergency symptom?",
    answer:
      "Certain symptoms, like chest pain, breathlessness, or sudden vision loss, are checked before anything else. If one matches, you get an immediate emergency banner telling you to seek care or call 112, and the system skips doctor matching entirely rather than risk delaying you.",
  },
  {
    question: "Can a doctor change a prescription after it's issued?",
    answer:
      "Not by editing it. Prescriptions are immutable once created. If a doctor needs to amend a diagnosis or dosage, they issue a new version that links back to the original, so the full history stays intact and auditable.",
  },
  {
    question: "Is home sample collection available for lab tests?",
    answer:
      "Where the lab offers it, yes. Each partner lab's profile shows whether home collection is available; if it is, you can choose it directly when booking a referred or walk-in test.",
  },
  {
    question: "How is my data handled?",
    answer:
      "The platform is designed with DPDP Act principles in mind: encryption at rest, consent flags, and an audit log on every cross-role action (who did what, and when). MedLink does not claim HIPAA compliance, and is built as a portfolio project rather than a certified medical system.",
  },
  {
    question: "Which cities is MedLink available in?",
    answer: "The current doctor and lab network covers Noida, Delhi, and Ghaziabad, across 10 specialties.",
  },
];

const features = [
  {
    icon: Sparkles,
    title: "AI that knows its limits",
    description:
      "The triage engine maps symptoms to a specialty and ranks doctors. It never diagnoses and never prescribes, so every recommendation still ends with a real doctor's judgment.",
  },
  {
    icon: ShieldCheck,
    title: "A trail for every action",
    description:
      "Every booking, confirmation, prescription, and referral is timestamped and attributable. If a patient or regulator ever asks what happened, the answer is already logged.",
  },
  {
    icon: FileCheck2,
    title: "Records that can't be edited away",
    description:
      "Prescriptions are immutable. A doctor amending a diagnosis creates a new, linked version instead of overwriting history, so the record stays legally defensible.",
  },
];

// This fetch runs on the Next.js server, not in the browser, so it must reach
// the API by a hostname the server can resolve. Under Docker Compose that is the
// internal service name (`http://api:4000/api`), not the host-mapped localhost
// port the browser uses. Falls back to the public var, then to the local-dev
// default, so `npm run dev` needs no extra configuration.
const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

interface DoctorSearchItem {
  _id: string;
  specialties: string[];
  ratingCount: number;
  userId: { name: string };
}

interface Testimonial {
  score: number;
  text: string;
  doctorName: string;
  specialty: string;
}

async function getStats(): Promise<{ doctorCount: number; labCount: number }> {
  const [doctorsRes, labsRes] = await Promise.all([
    fetch(`${API_BASE}/doctors?limit=1`, { cache: "no-store" }),
    fetch(`${API_BASE}/labs?limit=1`, { cache: "no-store" }),
  ]);
  const doctors = doctorsRes.ok ? await doctorsRes.json() : { total: 0 };
  const labs = labsRes.ok ? await labsRes.json() : { total: 0 };
  return { doctorCount: doctors.total ?? 0, labCount: labs.total ?? 0 };
}

// No aggregate "all reviews" endpoint exists (ratings are fetched per doctor),
// so this samples a page of doctors, pulls each one's ratings in parallel, and
// keeps the first few that have review text. Real seeded data, not fabricated
// copy -- just assembled from the same per-doctor endpoint the profile page uses.
async function getTestimonials(): Promise<Testimonial[]> {
  const res = await fetch(`${API_BASE}/doctors?limit=20`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  const candidates = (data.items as DoctorSearchItem[]).filter((d) => d.ratingCount > 0).slice(0, 8);

  const withRatings = await Promise.all(
    candidates.map(async (d) => {
      const r = await fetch(`${API_BASE}/ratings/doctor/${d._id}?limit=5`, { cache: "no-store" });
      if (!r.ok) return null;
      const rd = await r.json();
      const withText = (rd.items as { score: number; text?: string }[]).find((x) => x.text);
      if (!withText?.text) return null;
      return { score: withText.score, text: withText.text, doctorName: d.userId.name, specialty: d.specialties[0] };
    })
  );

  return withRatings.filter((t): t is Testimonial => t !== null).slice(0, 3);
}

export default async function Home() {
  const [{ doctorCount, labCount }, testimonials] = await Promise.all([getStats(), getTestimonials()]);
  const stats = [
    { value: `${doctorCount}+`, label: "Verified doctors" },
    { value: `${labCount}`, label: "Partner labs" },
    { value: "10", label: "Specialties covered" },
    { value: "3", label: "NCR cities" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/60 bg-background/80 px-6 backdrop-blur-md md:px-16">
        <span className="text-lg font-semibold tracking-tight text-foreground">MedLink</span>
        <nav className="flex items-center gap-1">
          <Link href="/search" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
            Find doctors &amp; labs
          </Link>
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
            Get started
          </Link>
        </nav>
      </header>

      <section className="grid items-center gap-12 px-6 pb-16 pt-16 md:grid-cols-2 md:px-16 md:pb-20 md:pt-20">
        <div className="flex flex-col items-start gap-6 text-left">
          <h1 className="animate-fade-up max-w-md text-5xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Describe your symptoms. We&apos;ll find who can help.
          </h1>
          <p className="animate-fade-up max-w-md text-lg leading-relaxed text-muted-foreground" style={{ animationDelay: "80ms" }}>
            AI symptom triage, doctor matching, booking, prescriptions, and lab referrals, all in one calm flow.
          </p>
          <div className="animate-fade-up flex flex-wrap items-center gap-3" style={{ animationDelay: "160ms" }}>
            <Link href="/register" className={cn(buttonVariants({ variant: "accent", size: "lg" }))}>
              Get started
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Sign in
            </Link>
          </div>
          <p className="animate-fade-up text-xs text-muted-foreground" style={{ animationDelay: "200ms" }}>
            This is guidance, not medical advice.
          </p>
        </div>
        <div className="relative hidden h-[26rem] overflow-hidden rounded-3xl bg-muted md:block">
          <HeroPreview />
        </div>
      </section>

      <section className="border-y border-border bg-card px-6 py-10 md:px-16">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center md:text-left">
              <p className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 md:px-16">
        <div className="mb-10 max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Built for everyone in the loop
          </h2>
          <p className="mt-2 text-muted-foreground">
            One platform, four roles, a single source of truth for every visit.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:grid-rows-2">
          {roleEntries.map(({ label, description, icon: Icon, featured }, i) => (
            <Link
              key={label}
              href="/login"
              className={cn(
                "animate-fade-up",
                i === 0 && "md:col-start-1 md:row-start-1 md:row-span-2",
                i === 1 && "md:col-start-2 md:col-span-2 md:row-start-1",
                i === 2 && "md:col-start-2 md:row-start-2",
                i === 3 && "md:col-start-3 md:row-start-2"
              )}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Card
                className={cn(
                  "h-full justify-between gap-8 p-6",
                  featured
                    ? "bg-primary text-primary-foreground ring-0"
                    : "hover:bg-secondary/40"
                )}
              >
                <Icon className={cn("size-6", featured ? "text-primary-foreground" : "text-primary")} />
                <div>
                  <CardTitle className={cn(featured && "text-primary-foreground")}>{label}</CardTitle>
                  <CardDescription className={cn("mt-1", featured && "text-primary-foreground/70")}>
                    {description}
                  </CardDescription>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 md:px-16">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="relative order-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl bg-primary md:order-1">
            <ShieldCheck className="absolute size-64 text-primary-foreground/10" strokeWidth={1} />
            <p className="relative max-w-[16rem] text-center text-xl font-semibold leading-snug text-primary-foreground">
              Every prescription. Every referral. Logged.
            </p>
          </div>
          <div className="order-1 md:order-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              Why we built this
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Getting from &ldquo;something feels off&rdquo; to a treatment plan usually means five systems that
              don&apos;t talk to each other: searching symptoms online, guessing at a specialty, calling clinics
              to find an open slot, and leaving with a paper prescription that&apos;s gone missing by the time lab
              results arrive.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              MedLink is one flow instead. AI narrows down who to see, booking confirms a real slot with a real
              doctor, the prescription that comes out the other end is a permanent and verifiable record, and a
              lab referral follows the patient automatically when a test is needed. Every step is logged. The AI
              is never the one making the call.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-primary px-6 py-20 text-primary-foreground md:px-16">
        <div className="mb-10 max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Designed like it matters</h2>
          <p className="mt-2 text-primary-foreground/70">
            Healthcare software earns trust in the details. Here&apos;s what that looks like under the hood.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl bg-primary-foreground/10 p-6">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary-foreground/15">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-primary-foreground/70">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 md:px-16">
        <div className="relative grid gap-10 md:grid-cols-3">
          <div aria-hidden className="absolute left-0 right-0 top-6 hidden h-px bg-border md:block" />
          {steps.map(({ label, description, icon: Icon }) => (
            <div key={label} className="relative flex flex-col items-start gap-3">
              <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-card ring-1 ring-border">
                <Icon className="size-5 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{label}</h3>
              <p className="max-w-[30ch] text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {testimonials.length > 0 ? (
        <section className="px-6 py-20 md:px-16">
          <div className="mb-10 max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              What patients are saying
            </h2>
            <p className="mt-2 text-muted-foreground">Real reviews, pulled straight from completed appointments.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Card key={i} className="animate-fade-up p-6" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={cn("size-3.5", n <= t.score ? "fill-accent text-accent" : "text-border")} />
                  ))}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-foreground">&ldquo;{t.text}&rdquo;</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  Patient of {t.doctorName} &middot; {t.specialty}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="px-6 py-20 md:px-16">
        <div className="mb-10 max-w-xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Common questions</h2>
          <p className="mt-2 text-muted-foreground">The things people usually ask before their first booking.</p>
        </div>
        <div className="mx-auto grid max-w-3xl gap-6 sm:grid-cols-2">
          {faqs.map(({ question, answer }, i) => (
            <div key={question} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
              <h3 className="text-sm font-semibold text-foreground">{question}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-6 mb-20 rounded-3xl bg-accent px-6 py-16 text-center text-accent-foreground md:mx-16 md:px-16">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Ready when you are.</h2>
        <p className="mx-auto mt-2 max-w-md text-accent-foreground/85">
          Start with your symptoms, or browse doctors and labs directly. Either way, you&apos;re a few minutes from booked.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className={cn(buttonVariants({ variant: "default", size: "lg" }), "bg-white text-accent hover:bg-white/90")}>
            Get started
          </Link>
          <Link
            href="/search"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-accent-foreground/30 bg-transparent text-accent-foreground hover:bg-accent-foreground/10")}
          >
            Browse doctors &amp; labs
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground md:px-16">
        MedLink &middot;{" "}
        <Link href="/search" className="underline hover:text-foreground">
          Find doctors &amp; labs
        </Link>
      </footer>
    </div>
  );
}
