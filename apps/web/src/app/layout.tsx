import type { Metadata } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import { StoreProvider } from "@/store/StoreProvider";
import { BlobBackground } from "@/components/ui/blob-background";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
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
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BlobBackground variant="ambient" />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
