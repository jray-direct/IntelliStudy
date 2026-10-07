"use server";

import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SessionMode } from "@/db/schema";
import { db, schema } from "@/lib/db";
import {
  applyRating,
  freshProgress,
  previewIntervals,
  type Previews,
  type ProgressValues,
} from "@/lib/fsrs";
import {
  findMasterFor,
  getCollection,
  summarizeTrainingDeck,
  type DeckStatus,
} from "@/lib/library";
import type { Grade } from "ts-fsrs";

const {
  cards,
  cardProgress,
  cardTags,
  collectionCards,
  collections,
  reviews,
  studySessions,
  tags,
} = schema;

const intField = z.coerce.number().int();
const text = (max = 20_000) => z.string().trim().max(max);

function refresh() {
  revalidatePath("/", "layout");
}

function parseTagNames(raw: string): string[] {
  const seen = new Map<string, string>();
  for (const part of raw.split(/[,\n]/)) {
    const name = part.trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

function setCardTags(cardId: number, names: string[]) {
  db.delete(cardTags).where(eq(cardTags.cardId, cardId)).run();
  for (const name of names) {
    const existing = db
      .select()
      .from(tags)
      .where(sql`lower(${tags.name}) = lower(${name})`)
      .get();
    const tagId = existing?.id ?? db.insert(tags).values({ name }).returning().get().id;
    db.insert(cardTags).values({ cardId, tagId }).onConflictDoNothing().run();
  }
}

function pruneOrphanCards() {
  db.delete(cards)
    .where(
      notExists(
        db.select({ one: sql`1` }).from(collectionCards).where(eq(collectionCards.cardId, cards.id)),
      ),
    )
    .run();
  db.delete(tags)
    .where(notExists(db.select({ one: sql`1` }).from(cardTags).where(eq(cardTags.tagId, tags.id))))
    .run();
}

/* ---------------------------------- collections --------------------------------- */

const createCollectionSchema = z.object({
  name: text(200).min(1),
  parentId: z.preprocess((v) => (v === "" || v == null ? null : v), intField.nullable()),
  kind: z.enum(["certification", "graduate_course", "general"]).default("general"),
  role: z.enum(["container", "training"]).default("container"),
  description: text(2000).optional(),
});

export async function createCollection(formData: FormData) {
  const input = createCollectionSchema.parse(Object.fromEntries(formData));
  const created = db
    .insert(collections)
    .values({
      name: input.name,
      parentId: input.parentId,
      kind: input.kind,
      role: input.role,
      description: input.description || null,
    })
    .returning()
    .get();

  // Every top-level subject gets a master deck that trained subdecks promote into.
  if (input.parentId === null) {
    db.insert(collections)
      .values({ name: "Master Deck", parentId: created.id, kind: input.kind, role: "master", position: -1 })
      .run();
  }
  refresh();
  redirect(`/collections/${created.id}`);
}

const updateCollectionSchema = z.object({
  id: intField,
  name: text(200).min(1),
  description: text(2000).optional(),
  qualifyPasses: intField.min(1).max(10).optional(),
  qualifyDistinctDays: z.string().optional(),
});

export async function updateCollection(formData: FormData) {
  const input = updateCollectionSchema.parse(Object.fromEntries(formData));
  const current = getCollection(input.id);
  if (!current) return;
  db.update(collections)
    .set({
      name: input.name,
      description: input.description || null,
      ...(current.role === "training"
        ? {
            qualifyPasses: input.qualifyPasses ?? current.qualifyPasses,
            qualifyDistinctDays: input.qualifyDistinctDays === "on",
          }
        : {}),
    })
    .where(eq(collections.id, input.id))
    .run();
  refresh();
}

export async function deleteCollection(formData: FormData) {
  const id = intField.parse(formData.get("id"));
  const c = getCollection(id);
  db.delete(collections).where(eq(collections.id, id)).run();
  pruneOrphanCards();
  refresh();
  redirect(c?.parentId ? `/collections/${c.parentId}` : "/library");
}

/* ------------------------------------- cards ------------------------------------ */

const cardTypeSchema = z.enum([
  "basic",
  "multiple_choice",
  "true_false",
  "fill_blank",
  "definition",
  "command",
  "scenario",
]);

const cardFields = z.object({
  prompt: text().min(1),
  answer: text().min(1),
  explanation: text().optional(),
  source: text(500).optional(),
  cardType: cardTypeSchema.default("basic"),
  tags: text(1000).optional(),
});

export async function createCard(formData: FormData) {
  const collectionId = intField.parse(formData.get("collectionId"));
  const input = cardFields.parse(Object.fromEntries(formData));
  const card = db
    .insert(cards)
    .values({
      cardType: input.cardType,
      promptMarkdown: input.prompt,
      answerMarkdown: input.answer,
      explanationMarkdown: input.explanation || null,
      source: input.source || null,
    })
    .returning()
    .get();
  db.insert(collectionCards).values({ collectionId, cardId: card.id }).run();
  setCardTags(card.id, parseTagNames(input.tags ?? ""));
  refresh();
}

export async function bulkCreateCards(formData: FormData) {
  const collectionId = intField.parse(formData.get("collectionId"));
  const raw = text(500_000).parse(formData.get("bulk") ?? "");
  const defaultTags = parseTagNames(text(1000).parse(formData.get("tags") ?? ""));

  const pairs: Array<[string, string]> = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sep = line.includes("\t") ? "\t" : line.includes(" | ") ? " | " : "|";
    const idx = line.indexOf(sep);
    if (idx < 0) continue;
    const front = line.slice(0, idx).trim();
    const back = line.slice(idx + sep.length).trim();
    if (front && back) pairs.push([front, back]);
  }

  db.transaction(() => {
    for (const [front, back] of pairs) {
      const card = db
        .insert(cards)
        .values({ promptMarkdown: front, answerMarkdown: back })
        .returning()
        .get();
      db.insert(collectionCards).values({ collectionId, cardId: card.id }).run();
      if (defaultTags.length) setCardTags(card.id, defaultTags);
    }
  });
  refresh();
  redirect(`/collections/${collectionId}?imported=${pairs.length}`);
}

export async function updateCard(formData: FormData) {
  const id = intField.parse(formData.get("id"));
  const input = cardFields.parse(Object.fromEntries(formData));
  db.update(cards)
    .set({
      cardType: input.cardType,
      promptMarkdown: input.prompt,
      answerMarkdown: input.answer,
      explanationMarkdown: input.explanation || null,
      source: input.source || null,
      updatedAt: new Date(),
    })
    .where(eq(cards.id, id))
    .run();
  setCardTags(id, parseTagNames(input.tags ?? ""));
  refresh();
  const back = formData.get("returnTo");
  redirect(typeof back === "string" && back.startsWith("/") ? back : "/library");
}

export async function deleteCard(formData: FormData) {
  const id = intField.parse(formData.get("id"));
  db.delete(cards).where(eq(cards.id, id)).run();
  refresh();
  const back = formData.get("returnTo");
  redirect(typeof back === "string" && back.startsWith("/") ? back : "/library");
}

export async function toggleSuspend(formData: FormData) {
  const id = intField.parse(formData.get("id"));
  db.update(cards)
    .set({ suspended: sql`not ${cards.suspended}` })
    .where(eq(cards.id, id))
    .run();
  refresh();
}

/* ---------------------------------- promotion ------------------------------------ */

export async function promoteDeck(formData: FormData) {
  const trainingId = intField.parse(formData.get("id"));
  promoteTrainingDeck(trainingId);
  refresh();
}

function promoteTrainingDeck(trainingId: number): number {
  const master = findMasterFor(trainingId);
  if (!master) throw new Error("No master deck found for this collection.");

  const now = new Date();
  let promoted = 0;
  db.transaction(() => {
    const active = db
      .select({ id: cards.id })
      .from(collectionCards)
      .innerJoin(cards, eq(cards.id, collectionCards.cardId))
      .where(and(eq(collectionCards.collectionId, trainingId), eq(cards.suspended, false)))
      .all()
      .map((r) => r.id);
    if (!active.length) return;

    const already = new Set(
      db
        .select({ id: collectionCards.cardId })
        .from(collectionCards)
        .where(
          and(eq(collectionCards.collectionId, master.id), inArray(collectionCards.cardId, active)),
        )
        .all()
        .map((r) => r.id),
    );

    for (const cardId of active) {
      if (already.has(cardId)) continue;
      db.insert(collectionCards)
        .values({ collectionId: master.id, cardId, promotedFromCollectionId: trainingId })
        .run();
      promoted++;
    }

    for (const cardId of active) {
      db.insert(cardProgress)
        .values({ cardId, ...freshProgress(now) })
        .onConflictDoNothing()
        .run();
    }
    db.update(cards).set({ lifecycle: "mastered" }).where(inArray(cards.id, active)).run();
  });
  return promoted;
}

/* ------------------------------------ studying ----------------------------------- */

export async function startSession(
  collectionId: number | null,
  mode: SessionMode,
): Promise<number> {
  const id = collectionId && collectionId > 0 ? collectionId : null;
  return db.insert(studySessions).values({ collectionId: id, mode }).returning().get().id;
}

const drillAnswer = z.object({
  sessionId: intField,
  cardId: intField,
  correct: z.boolean(),
  attempt: intField.min(1),
  responseTimeMs: intField.min(0).nullable(),
  countsTowardLifecycle: z.boolean(),
});

export async function answerDrill(input: z.input<typeof drillAnswer>): Promise<void> {
  const a = drillAnswer.parse(input);
  db.insert(reviews)
    .values({
      cardId: a.cardId,
      sessionId: a.sessionId,
      kind: "drill",
      rating: a.correct ? 3 : 1,
      attempt: a.attempt,
      responseTimeMs: a.responseTimeMs,
    })
    .run();
  if (a.countsTowardLifecycle) {
    db.update(cards)
      .set({ lifecycle: "learning" })
      .where(and(eq(cards.id, a.cardId), eq(cards.lifecycle, "new")))
      .run();
  }
}

const reviewAnswer = z.object({
  sessionId: intField,
  cardId: intField,
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  attempt: intField.min(1),
  responseTimeMs: intField.min(0).nullable(),
});

export type ReviewResult = { dueAt: number; previews: Previews; requeue: boolean };

export async function answerReview(input: z.input<typeof reviewAnswer>): Promise<ReviewResult> {
  const a = reviewAnswer.parse(input);
  const now = new Date();

  const existing = db.select().from(cardProgress).where(eq(cardProgress.cardId, a.cardId)).get();
  const current: ProgressValues = existing
    ? (existing as ProgressValues)
    : freshProgress(now);

  const { next } = applyRating(current, a.rating as Grade, now);
  const elapsedDays = current.lastReviewAt
    ? Math.max(0, Math.floor((now.getTime() - current.lastReviewAt.getTime()) / 86_400_000))
    : 0;

  db.transaction(() => {
    db.insert(cardProgress)
      .values({ cardId: a.cardId, ...next })
      .onConflictDoUpdate({ target: cardProgress.cardId, set: next })
      .run();
    db.insert(reviews)
      .values({
        cardId: a.cardId,
        sessionId: a.sessionId,
        kind: "fsrs",
        rating: a.rating,
        attempt: a.attempt,
        elapsedDays,
        responseTimeMs: a.responseTimeMs,
      })
      .run();
  });

  const SAME_SESSION_MS = 20 * 60_000;
  return {
    dueAt: next.dueAt.getTime(),
    previews: previewIntervals(next, now),
    requeue: next.dueAt.getTime() - now.getTime() < SAME_SESSION_MS,
  };
}

export type SessionResult = {
  status: DeckStatus | null;
  lastScore: { correct: number; total: number } | null;
  qualified: boolean;
};

export async function finishSession(sessionId: number): Promise<SessionResult> {
  const session = db.select().from(studySessions).where(eq(studySessions.id, sessionId)).get();
  if (!session) return { status: null, lastScore: null, qualified: false };
  if (!session.endedAt) {
    db.update(studySessions).set({ endedAt: new Date() }).where(eq(studySessions.id, sessionId)).run();
  }

  let result: SessionResult = { status: null, lastScore: null, qualified: false };
  if (session.mode === "drill" && session.collectionId) {
    const c = getCollection(session.collectionId);
    if (c) {
      const summary = summarizeTrainingDeck(c);
      if (summary.status === "qualified") {
        db.update(cards)
          .set({ lifecycle: "qualified" })
          .where(
            and(
              eq(cards.suspended, false),
              eq(cards.lifecycle, "learning"),
              inArray(
                cards.id,
                db
                  .select({ id: collectionCards.cardId })
                  .from(collectionCards)
                  .where(eq(collectionCards.collectionId, c.id)),
              ),
            ),
          )
          .run();
      }
      result = {
        status: summary.status,
        lastScore: summary.lastScore,
        qualified: summary.status === "qualified" || summary.status === "mastered",
      };
    }
  }
  refresh();
  return result;
}
