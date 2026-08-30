import type { Metadata } from "next";
import { Manrope, Geist_Mono, Space_Grotesk } from "next/font/google";
import { StoreProvider } from "@/store/StoreProvider";
import { BlobBackground } from "@/components/ui/blob-background";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedLink",
  description:
    "AI-guided symptom triage, doctor matching, appointment booking, prescriptions, and lab referrals in one platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${spaceGrotesk.variable} ${geistMono.variable} h-full antialiased`}
      // The blocking script below adds the `dark` class before hydration, which never
      // matches the server-rendered markup by design (theme preference is client-only
      // state) -- this is the standard, expected mismatch for this pattern.
      suppressHydrationWarning
    >
      <head>
        {/* Blocking, runs before first paint: sets the `dark` class from the saved
            preference (or OS preference, if none saved yet) so there's no flash of the
            wrong theme. Must stay inline -- an external/deferred script would paint
            light first regardless. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <BlobBackground variant="ambient" />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
