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
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { HeartbeatBackground } from "@/components/ui/heartbeat-background";
import { FloatingIcon3D } from "@/components/ui/floating-icon-3d";

const ROLES = [
  {
    label: "Patient",
    description: "Describe your symptoms, get matched with a doctor, and book an appointment.",
    icon: User,
    accent: "bg-blue-100 text-blue-700",
  },
  {
    label: "Doctor",
    description: "Manage your schedule, confirm bookings, and write prescriptions.",
    icon: Stethoscope,
    accent: "bg-primary/10 text-primary",
  },
  {
    label: "Lab",
    description: "Receive referrals, manage bookings, and upload reports.",
    icon: FlaskConical,
    accent: "bg-emerald-100 text-emerald-700",
  },
  {
    label: "Admin",
    description: "Verify doctors and labs, and monitor platform activity.",
    icon: ShieldPlus,
    accent: "bg-amber-100 text-amber-700",
  },
];

const STEPS = [
  { label: "Triage", description: "Describe your symptoms to get matched with the right specialty.", icon: Stethoscope },
  { label: "Book", description: "Pick a doctor and a slot that works for you.", icon: CalendarCheck },
  { label: "Prescribe & Refer", description: "Your doctor prescribes medicines and refers lab tests if needed.", icon: ClipboardPlus },
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
          <HeartbeatBackground />
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
                  <p className="text-4xl font-bold text-primary">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-6 py-10">
          <h2 className="mb-6 text-center font-heading text-4xl font-semibold">One platform, four roles</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ label, description, icon: Icon, accent }) => (
              <Link key={label} href="/login">
                <Card className="h-full">
                  <CardHeader>
                    <div className={`flex size-11 items-center justify-center rounded-full ${accent}`}>
                      <Icon className="size-6" />
                    </div>
                    <CardTitle className="font-heading text-lg font-semibold">{label}</CardTitle>
                    <CardDescription className="text-base">{description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-4xl px-6 py-10">
          <h2 className="mb-8 text-center font-heading text-4xl font-semibold">How it works</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map(({ label, description, icon: Icon }, i) => (
              <div key={label} className="space-y-2 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="size-7 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">{i + 1}. {label}</h3>
                <p className="text-base text-muted-foreground">{description}</p>
              </div>
            ))}
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
