import { BlobBackground } from "@/components/ui/blob-background";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid flex-1 md:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-16">{children}</div>
      <div className="relative hidden overflow-hidden bg-secondary md:block">
        <BlobBackground variant="hero" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-10 text-center">
          <p className="text-xl font-semibold text-foreground">
            One calm flow, start to finish.
          </p>
          <p className="text-sm text-muted-foreground">
            Triage, booking, prescriptions, and lab referrals in one place.
          </p>
        </div>
      </div>
    </div>
  );
}
