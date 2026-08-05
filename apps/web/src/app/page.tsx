import Link from "next/link";
import {
  Stethoscope,
  FlaskConical,
  ShieldPlus,
  User,
  CalendarCheck,
  ClipboardPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChainBackground } from "@/components/ui/chain-background";
import { FloatingIcon3D } from "@/components/ui/floating-icon-3d";

// The chain doesn't stop at the hero divider: it's the actual layout. A case
// moves through these 3 steps (a real connected rail below), then the chain
// branches to the 4 roles who touch it (a connected row, not a card grid).
const STEPS = [
  {
    label: "Triage",
    description: "Describe your symptoms to get matched with the right specialty.",
    icon: Stethoscope,
    color: "bg-primary",
  },
  {
    label: "Book",
    description: "Pick a doctor and a slot that works for you.",
    icon: CalendarCheck,
    color: "bg-accent",
  },
  {
    label: "Prescribe & Refer",
    description: "Your doctor prescribes medicines and refers lab tests if needed.",
    icon: ClipboardPlus,
    color: "bg-verified",
  },
];

const ROLES = [
  {
    label: "Patient",
    description: "Describe symptoms, book, and track your care.",
    icon: User,
  },
  {
    label: "Doctor",
    description: "Confirm bookings, prescribe, refer.",
    icon: Stethoscope,
  },
  {
    label: "Lab",
    description: "Receive referrals, upload reports.",
    icon: FlaskConical,
  },
  {
    label: "Admin",
    description: "Verify providers, watch the system.",
    icon: ShieldPlus,
  },
];

const STATS = [
  { value: "12", label: "Doctors" },
  { value: "4", label: "Path labs" },
  { value: "AI", label: "Symptom triage" },
  { value: "24/7", label: "Booking" },
];

export default function Home() {
  return (
    <>
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-heading text-2xl font-semibold">MedLink</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Log in
          </Button>
          <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
            Sign up
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden px-6 pt-6 pb-24 text-center">
          <ChainBackground />
          <div className="relative mx-auto max-w-3xl space-y-6">
            <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium shadow-sm">
              <FloatingIcon3D src="/icons-3d/heart.png" size={20} alt="" />
              AI-powered healthcare, end to end
            </span>
            <h1 className="font-heading text-6xl font-semibold text-foreground sm:text-7xl">
              Care, <span className="text-primary">connected.</span>
            </h1>
            <p className="text-xl text-muted-foreground">
              AI symptom triage, doctor matching, appointment booking, prescriptions, and
              lab referrals &mdash; one connected healthcare flow.
            </p>
            <p className="text-sm text-muted-foreground">This is guidance, not medical advice.</p>
            <Button size="lg" nativeButton={false} render={<Link href="/login">Get started &mdash; it&apos;s free</Link>} />

            <div className="mx-auto grid max-w-lg grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label}>
                  <p className="font-heading text-4xl font-semibold text-primary">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* One connected rail carries the whole page's second half: the 3
            real steps a case moves through, then it branches into the 4
            roles who touch it. Not a hero followed by two disconnected
            feature grids -- a single through-line, matching what the
            product actually is. */}
        <section className="mx-auto w-full max-w-2xl px-6 py-16">
          <h2 className="mb-12 text-center font-heading text-3xl font-semibold">How a case moves</h2>
          <div className="relative space-y-10 pl-14">
            <div className="absolute top-3 bottom-3 left-[23px] w-0.5 bg-border" aria-hidden="true" />
            {STEPS.map(({ label, description, icon: Icon, color }, i) => (
              <div key={label} className="relative">
                <span
                  className={`absolute top-0 -left-14 flex size-11 items-center justify-center rounded-full text-white ${color}`}
                >
                  <Icon className="size-5" />
                </span>
                <p className="font-heading text-xs tracking-wide text-muted-foreground uppercase">Step {i + 1}</p>
                <h3 className="text-xl font-semibold">{label}</h3>
                <p className="text-base text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>

          {/* The rail's last link branches to everyone who touches the case. */}
          <div className="relative mt-4 pl-14">
            <div className="absolute top-0 left-[23px] h-8 w-0.5 bg-border" aria-hidden="true" />
          </div>
          <div className="relative mt-8">
            <div className="absolute top-6 right-8 left-8 h-0.5 bg-border sm:right-12 sm:left-12" aria-hidden="true" />
            <div className="relative grid grid-cols-2 gap-6 sm:grid-cols-4">
              {ROLES.map(({ label, description, icon: Icon }) => (
                <Link key={label} href="/login" className="group text-center">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-full border-2 border-primary bg-card text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-3 font-heading text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        <Link href="/search" className="underline">
          Search doctors &amp; labs
        </Link>
      </footer>
    </>
  );
}
