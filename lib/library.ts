import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { retrievability, type ProgressValues } from "@/lib/fsrs";

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

export type Collection = typeof collections.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type CardWithTags = Card & { tags: string[] };

export type TreeNode = Collection & { children: TreeNode[] };

export function getCollection(id: number): Collection | undefined {
  return db.select().from(collections).where(eq(collections.id, id)).get();
}

export function getAllCollections(): Collection[] {
  return db
    .select()
    .from(collections)
    .orderBy(asc(collections.position), asc(collections.id))
    .all();
}

export function buildTree(rows: Collection[] = getAllCollections()): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: TreeNode[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  return roots;
}

export function getAncestors(id: number, rows = getAllCollections()): Collection[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const chain: Collection[] = [];
  let cur = byId.get(id);
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    chain.unshift(parent);
    cur = parent;
  }
  return chain;
}

export function getDescendantIds(id: number, rows = getAllCollections()): number[] {
  const children = new Map<number, number[]>();
  rows.forEach((r) => {
    if (r.parentId) children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id]);
  });
  const out: number[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    out.push(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
}

/** The master deck a training deck promotes into: nearest ancestor's master child. */
export function findMasterFor(collectionId: number): Collection | undefined {
  const rows = getAllCollections();
  const ancestors = getAncestors(collectionId, rows).reverse();
  for (const a of ancestors) {
    const m = rows.find((r) => r.parentId === a.id && r.role === "master");
    if (m) return m;
  }
  return undefined;
}

export function getMasterCollections(): Collection[] {
  return db.select().from(collections).where(eq(collections.role, "master")).all();
}

export function listCards(collectionId: number): CardWithTags[] {
  const rows = db
    .select({ card: cards })
    .from(collectionCards)
    .innerJoin(cards, eq(cards.id, collectionCards.cardId))
    .where(eq(collectionCards.collectionId, collectionId))
    .orderBy(asc(cards.id))
    .all()
    .map((r) => r.card);
  return attachTags(rows);
}

export function attachTags(rows: Card[]): CardWithTags[] {
  if (!rows.length) return [];
  const tagRows = db
    .select({ cardId: cardTags.cardId, name: tags.name })
    .from(cardTags)
    .innerJoin(tags, eq(tags.id, cardTags.tagId))
    .where(inArray(cardTags.cardId, rows.map((r) => r.id)))
    .all();
  const byCard = new Map<number, string[]>();
  tagRows.forEach((t) => byCard.set(t.cardId, [...(byCard.get(t.cardId) ?? []), t.name]));
  return rows.map((r) => ({ ...r, tags: (byCard.get(r.id) ?? []).sort() }));
}

export function getCard(id: number): CardWithTags | undefined {
  const row = db.select().from(cards).where(eq(cards.id, id)).get();
  return row ? attachTags([row])[0] : undefined;
}

export function getCardCollections(cardId: number): Collection[] {
  return db
    .select({ c: collections })
    .from(collectionCards)
    .innerJoin(collections, eq(collections.id, collectionCards.collectionId))
    .where(eq(collectionCards.cardId, cardId))
    .all()
    .map((r) => r.c);
}

export function allTagNames(): string[] {
  return db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name)).all().map((t) => t.name);
}

export type DeckStatus = "empty" | "not_started" | "learning" | "qualified" | "mastered";

export type DeckSummary = {
  collection: Collection;
  masterId: number | null;
  total: number;
  promoted: number;
  status: DeckStatus;
  lastScore: { correct: number; total: number } | null;
  perfectStreak: number;
  passesNeeded: number;
};

function activeCardIds(collectionId: number): number[] {
  return db
    .select({ id: cards.id })
    .from(collectionCards)
    .innerJoin(cards, eq(cards.id, collectionCards.cardId))
    .where(and(eq(collectionCards.collectionId, collectionId), eq(cards.suspended, false)))
    .all()
    .map((r) => r.id);
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Evaluate a training deck against its promotion rule, using the review log. */
export function summarizeTrainingDeck(c: Collection): DeckSummary {
  const active = activeCardIds(c.id);
  const master = findMasterFor(c.id);
  const promoted = master
    ? db
        .select({ n: sql<number>`count(*)` })
        .from(collectionCards)
        .where(
          and(
            eq(collectionCards.collectionId, master.id),
            active.length ? inArray(collectionCards.cardId, active) : sql`0`,
          ),
        )
        .get()!.n
    : 0;

  const sessions = db
    .select()
    .from(studySessions)
    .where(
      and(
        eq(studySessions.collectionId, c.id),
        eq(studySessions.mode, "drill"),
        isNotNull(studySessions.endedAt),
      ),
    )
    .orderBy(desc(studySessions.endedAt))
    .limit(25)
    .all();

  const activeSet = new Set(active);
  const scored = sessions.map((s) => {
    const firstTries = db
      .select({ cardId: reviews.cardId, rating: reviews.rating })
      .from(reviews)
      .where(and(eq(reviews.sessionId, s.id), eq(reviews.attempt, 1)))
      .all();
    const correct = new Set(
      firstTries.filter((r) => r.rating >= 3 && activeSet.has(r.cardId)).map((r) => r.cardId),
    ).size;
    return { endedAt: s.endedAt!, correct, perfect: active.length > 0 && correct === active.length };
  });

  const streak: typeof scored = [];
  for (const s of scored) {
    if (!s.perfect) break;
    streak.push(s);
  }
  const days = new Set(streak.map((s) => dayKey(s.endedAt))).size;
  const qualifyingPasses = c.qualifyDistinctDays ? days : streak.length;
  const qualified = qualifyingPasses >= c.qualifyPasses;

  let status: DeckStatus;
  if (active.length === 0) status = "empty";
  else if (promoted >= active.length) status = "mastered";
  else if (qualified) status = "qualified";
  else if (sessions.length === 0) status = "not_started";
  else status = "learning";

  return {
    collection: c,
    masterId: master?.id ?? null,
    total: active.length,
    promoted,
    status,
    lastScore: scored[0] ? { correct: scored[0].correct, total: active.length } : null,
    perfectStreak: qualifyingPasses,
    passesNeeded: c.qualifyPasses,
  };
}

export type MasterSummary = {
  collection: Collection;
  total: number;
  due: number;
  learning: number;
  established: number;
  avgRetrievability: number | null;
};

export function summarizeMaster(c: Collection, now = new Date()): MasterSummary {
  const rows = db
    .select({ p: cardProgress })
    .from(collectionCards)
    .innerJoin(cards, eq(cards.id, collectionCards.cardId))
    .innerJoin(cardProgress, eq(cardProgress.cardId, cards.id))
    .where(and(eq(collectionCards.collectionId, c.id), eq(cards.suspended, false)))
    .all()
    .map((r) => r.p);

  let due = 0;
  let learning = 0;
  let established = 0;
  let rSum = 0;
  let rN = 0;
  for (const p of rows) {
    if (p.dueAt <= now) due++;
    if (p.state === 2 && p.stability >= 21) established++;
    else learning++;
    if (p.lastReviewAt) {
      rSum += retrievability(p as ProgressValues, now);
      rN++;
    }
  }
  return {
    collection: c,
    total: rows.length,
    due,
    learning,
    established,
    avgRetrievability: rN ? rSum / rN : null,
  };
}

export function countCards(collectionId: number): number {
  return db
    .select({ n: sql<number>`count(*)` })
    .from(collectionCards)
    .where(eq(collectionCards.collectionId, collectionId))
    .get()!.n;
}

export function reviewsToday(now = new Date()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return db
    .select({ n: sql<number>`count(*)` })
    .from(reviews)
    .where(sql`${reviews.reviewedAt} >= ${start.getTime()}`)
    .get()!.n;
}
