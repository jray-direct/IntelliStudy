import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IntelliStudy",
  description: "Personal flashcards for certifications and graduate courses",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/library", label: "Library" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col md:flex-row">
        <aside className="md:w-56 md:min-h-screen shrink-0 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 px-5 py-4 md:py-6 flex md:flex-col gap-6 items-center md:items-stretch">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Intelli<span className="text-indigo-500">Study</span>
          </Link>
          <nav className="flex md:flex-col gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-2 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 min-w-0 px-5 md:px-10 py-6 md:py-8 max-w-5xl">{children}</main>
      </body>
    </html>
  );
}
