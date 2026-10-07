import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getMasterCollections } from "@/lib/library";
import {
  previewIntervals,
  retrievability,
  type Previews,
  type ProgressValues,
} from "@/lib/fsrs";

const { cards, cardProgress, collectionCards } = schema;

export type StudyMode = "drill" | "review" | "weakest" | "cram";
export const STUDY_MODES: StudyMode[] = ["drill", "review", "weakest", "cram"];

export type StudyCard = {
  id: number;
  prompt: string;
  answer: string;
  explanation: string | null;
  source: string | null;
  previews: Previews | null;
};

export const SESSION_LIMIT = 200;
export const WEAKEST_LIMIT = 40;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Row = { card: typeof cards.$inferSelect; progress: typeof cardProgress.$inferSelect | null };

function toStudyCard(row: Row, withPreviews: boolean, now: Date): StudyCard {
  return {
    id: row.card.id,
    prompt: row.card.promptMarkdown,
    answer: row.card.answerMarkdown,
    explanation: row.card.explanationMarkdown,
    source: row.card.source,
    previews:
      withPreviews && row.progress ? previewIntervals(row.progress as ProgressValues, now) : null,
  };
}

function rowsIn(collectionIds: number[]): Row[] {
  if (!collectionIds.length) return [];
  const rows = db
    .selectDistinct({ card: cards, progress: cardProgress })
    .from(collectionCards)
    .innerJoin(cards, eq(cards.id, collectionCards.cardId))
    .leftJoin(cardProgress, eq(cardProgress.cardId, cards.id))
    .where(and(inArray(collectionCards.collectionId, collectionIds), eq(cards.suspended, false)))
    .orderBy(asc(cards.id))
    .all();
  return rows;
}

/** "all" targets every master deck; otherwise a single collection id. */
export function resolveTargets(collection: string | number, mode: StudyMode): number[] {
  if (collection === "all" && mode !== "drill") return getMasterCollections().map((m) => m.id);
  const id = Number(collection);
  return Number.isFinite(id) ? [id] : [];
}

export function buildQueue(mode: StudyMode, collectionIds: number[], now = new Date()): StudyCard[] {
  const rows = rowsIn(collectionIds);

  switch (mode) {
    case "drill":
      return shuffle(rows).map((r) => toStudyCard(r, false, now));

    case "cram":
      return shuffle(rows)
        .slice(0, SESSION_LIMIT)
        .map((r) => toStudyCard(r, false, now));

    case "review":
      return rows
        .filter((r) => r.progress && r.progress.dueAt <= now)
        .sort((a, b) => a.progress!.dueAt.getTime() - b.progress!.dueAt.getTime())
        .slice(0, SESSION_LIMIT)
        .map((r) => toStudyCard(r, true, now));

    case "weakest":
      return rows
        .filter((r) => r.progress && r.progress.lastReviewAt)
        .map((r) => ({ r, ret: retrievability(r.progress as ProgressValues, now) }))
        .sort((a, b) => a.ret - b.ret)
        .slice(0, WEAKEST_LIMIT)
        .map(({ r }) => toStudyCard(r, true, now));
  }
}
