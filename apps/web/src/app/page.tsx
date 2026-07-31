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

const ROLES = [
  { label: "Patient", description: "Describe your symptoms, get matched with a doctor, and book an appointment.", icon: User },
  { label: "Doctor", description: "Manage your schedule, confirm bookings, and write prescriptions.", icon: Stethoscope },
  { label: "Lab", description: "Receive referrals, manage bookings, and upload reports.", icon: FlaskConical },
  { label: "Admin", description: "Verify doctors and labs, and monitor platform activity.", icon: ShieldPlus },
];

const STEPS = [
  { label: "Triage", description: "Describe your symptoms to get matched with the right specialty.", icon: Stethoscope },
  { label: "Book", description: "Pick a doctor and a slot that works for you.", icon: CalendarCheck },
  { label: "Prescribe & Refer", description: "Your doctor prescribes medicines and refers lab tests if needed.", icon: ClipboardPlus },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <HeartbeatBackground />
        <div className="relative mx-auto max-w-2xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">MedLink</h1>
          <p className="text-lg text-muted-foreground">
            AI symptom triage, doctor matching, appointment booking, prescriptions, and
            lab referrals &mdash; one connected healthcare flow.
          </p>
          <p className="text-sm text-muted-foreground">This is guidance, not medical advice.</p>
          <Button size="lg" render={<Link href="/login">Get started</Link>} />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map(({ label, description, icon: Icon }) => (
          <Link key={label} href="/login">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <Icon className="size-6 text-primary" />
                <CardTitle>{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-8 px-6 py-12 sm:grid-cols-3">
        {STEPS.map(({ label, description, icon: Icon }, i) => (
          <div key={label} className="space-y-2 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <h3 className="font-semibold">{i + 1}. {label}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>

      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        MedLink
      </footer>
    </main>
  );
}
