import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { DeckStatus } from "@/lib/library";

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-50";
export const btnPrimary = `${btn} bg-indigo-600 text-white hover:bg-indigo-500`;
export const btnSecondary = `${btn} border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800`;
export const btnDanger = `${btn} border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950`;
export const input =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
export const label = "block text-xs font-medium uppercase tracking-wide text-zinc-500 mb-1";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50 ${className}`}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </header>
  );
}

export function ProgressBar({ value, max, tone = "indigo" }: { value: number; max: number; tone?: "indigo" | "green" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
      <div
        className={`h-full rounded-full ${tone === "green" ? "bg-emerald-500" : "bg-indigo-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const statusStyles: Record<DeckStatus, { label: string; cls: string }> = {
  empty: { label: "Empty", cls: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" },
  not_started: { label: "Not started", cls: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  learning: { label: "Learning", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  qualified: { label: "Qualified", cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300" },
  mastered: { label: "Mastered", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
};

export function StatusBadge({ status }: { status: DeckStatus }) {
  const s = statusStyles[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

export function RoleBadge({ role }: { role: string }) {
  if (role === "container") return null;
  return (
    <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 dark:border-zinc-700">
      {role === "master" ? "master deck" : "training deck"}
    </span>
  );
}

export function ButtonLink(props: ComponentProps<typeof Link> & { variant?: "primary" | "secondary" }) {
  const { variant = "secondary", className = "", ...rest } = props;
  return <Link {...rest} className={`${variant === "primary" ? btnPrimary : btnSecondary} ${className}`} />;
}
