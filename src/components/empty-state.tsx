import Link from "next/link";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  /** Big friendly emoji shown in the soft green circle */
  icon: string;
  title: string;
  hint: string;
  actionLabel?: string;
  actionHref?: string;
}

/**
 * Friendly, beginner-oriented empty state — a warm "nothing here yet" message
 * with an optional action instead of a bare "no data" line.
 */
export function EmptyState({ icon, title, hint, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-3xl">
        <span aria-hidden>{icon}</span>
      </div>
      <p className="mt-4 text-base font-semibold text-zinc-800">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{hint}</p>
      {actionLabel && actionHref && (
        <Button asChild variant="secondary" className="mt-5 rounded-full">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}