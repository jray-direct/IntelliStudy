import {
  type Card as FsrsCard,
  type Grade,
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from "ts-fsrs";
import type { cardProgress } from "@/db/schema";

export const DESIRED_RETENTION = 0.9;

const scheduler = fsrs(
  generatorParameters({
    request_retention: DESIRED_RETENTION,
    enable_fuzz: false,
  }),
);

export type ProgressRow = typeof cardProgress.$inferSelect;
export type ProgressValues = Omit<ProgressRow, "cardId">;

export function freshProgress(now: Date): ProgressValues {
  return fromFsrs(createEmptyCard(now));
}

export function toFsrs(p: ProgressValues): FsrsCard {
  return {
    due: p.dueAt,
    stability: p.stability,
    difficulty: p.difficulty,
    elapsed_days: p.elapsedDays,
    scheduled_days: p.scheduledDays,
    learning_steps: p.learningSteps,
    reps: p.reps,
    lapses: p.lapses,
    state: p.state as State,
    last_review: p.lastReviewAt ?? undefined,
  };
}

export function fromFsrs(c: FsrsCard): ProgressValues {
  return {
    state: c.state,
    stability: c.stability,
    difficulty: c.difficulty,
    dueAt: c.due,
    lastReviewAt: c.last_review ?? null,
    reps: c.reps,
    lapses: c.lapses,
    learningSteps: c.learning_steps,
    scheduledDays: c.scheduled_days,
    elapsedDays: c.elapsed_days,
  };
}

export function applyRating(p: ProgressValues, rating: Grade, now: Date) {
  const { card, log } = scheduler.next(toFsrs(p), now, rating);
  return { next: fromFsrs(card), log };
}

export function retrievability(p: ProgressValues, now: Date): number {
  if (p.state === State.New || !p.lastReviewAt) return 0;
  return scheduler.get_retrievability(toFsrs(p), now, false);
}

export type Previews = Record<1 | 2 | 3 | 4, string>;

export function formatInterval(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = days / 30.4;
  if (months < 12) return `${months.toFixed(months < 10 ? 1 : 0)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export function previewIntervals(p: ProgressValues, now: Date): Previews {
  const rec = scheduler.repeat(toFsrs(p), now);
  const out = {} as Previews;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g as 1 | 2 | 3 | 4] = formatInterval(now, rec[g].card.due);
  }
  return out;
}

export { Rating, State };
