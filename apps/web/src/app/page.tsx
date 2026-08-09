import Link from "next/link";
import {
  User,
  UserRound,
  FlaskConical,
  ShieldCheck,
  Stethoscope,
  CalendarCheck,
  ClipboardPlus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BlobBackground } from "@/components/ui/blob-background";
import { cn } from "@/lib/utils";

const roleEntries = [
  {
    label: "Patient",
    description: "Get AI-guided triage, book appointments, and track your health timeline.",
    icon: User,
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
    description: "Describe your symptoms — AI maps them to the right specialty.",
    icon: Stethoscope,
  },
  {
    label: "Book",
    description: "Pick a matched doctor and an open slot, confirmed instantly.",
    icon: CalendarCheck,
  },
  {
    label: "Prescribe & Refer",
    description: "Get a verifiable prescription, with lab referrals when needed.",
    icon: ClipboardPlus,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="grid flex-1 items-center gap-10 px-6 py-20 md:grid-cols-2 md:px-16">
        <div className="flex flex-col items-start gap-6 text-left">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            Describe your symptoms. We&apos;ll find who can help.
          </h1>
          <p className="max-w-md text-lg leading-7 text-muted-foreground">
            AI symptom triage, doctor matching, appointment booking, prescriptions,
            and lab referrals — one calm flow, start to finish.
          </p>
          <p className="text-sm text-muted-foreground">
            This is guidance, not medical advice.
          </p>
          <div className="flex gap-3">
            <Link
              href="/register"
              className={cn(buttonVariants({ variant: "accent", size: "lg" }))}
            >
              Get started
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="relative hidden h-80 overflow-hidden rounded-3xl bg-muted md:block">
          <BlobBackground variant="hero" />
        </div>
      </section>

      <section className="grid gap-4 px-6 py-16 md:grid-cols-4 md:px-16">
        {roleEntries.map(({ label, description, icon: Icon }) => (
          <Link key={label} href="/login" className="block">
            <Card className="h-full p-6 transition-colors hover:bg-secondary/40">
              <CardHeader className="gap-3 px-0">
                <Icon className="size-6 text-primary" />
                <CardTitle>{label}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="grid gap-8 px-6 py-16 md:grid-cols-3 md:px-16">
        {steps.map(({ label, description, icon: Icon }) => (
          <div key={label} className="flex flex-col items-start gap-3">
            <Icon className="size-8 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">{label}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground md:px-16">
        MedLink ·{" "}
        <Link href="/search" className="underline hover:text-foreground">
          Find doctors & labs
        </Link>
      </footer>
    </div>
  );
}
