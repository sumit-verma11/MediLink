import Link from "next/link";
import { HeroPreview } from "@/components/marketing/hero-preview";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid flex-1 md:grid-cols-2">
      <div className="flex flex-col justify-center gap-10 px-6 py-16 md:px-16">
        <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
          MedLink
        </Link>
        <div className="flex flex-1 items-center justify-center md:justify-start">{children}</div>
      </div>
      <div className="hidden flex-col bg-muted md:flex">
        <div className="relative flex-1 overflow-hidden">
          <HeroPreview />
        </div>
        <div className="flex flex-col gap-1 px-10 pb-12">
          <p className="text-xl font-semibold text-foreground">One calm flow, start to finish.</p>
          <p className="text-sm text-muted-foreground">
            Triage, booking, prescriptions, and lab referrals in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
