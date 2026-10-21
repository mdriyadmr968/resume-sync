import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { GlobalSyncBanner } from "@/components/GlobalSyncBanner";

export const metadata: Metadata = {
  title: "Resume Sync — Local Browser Automation Assistant",
  description:
    "Synchronize your Master Resume from Google Docs / Drive or local storage to Portfolio, LinkedIn, BDJobs, and custom platforms.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090b10] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        <Navbar />
        <GlobalSyncBanner />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
