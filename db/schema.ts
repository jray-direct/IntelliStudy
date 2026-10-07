import { relations, sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export type CollectionRole = "container" | "training" | "master";
export type CollectionKind =
  | "certification"
  | "graduate_course"
  | "general";
export type CardType =
  | "basic"
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "definition"
  | "command"
  | "scenario";
export type Lifecycle = "new" | "learning" | "qualified" | "mastered";
export type ReviewKind = "drill" | "fsrs";
export type SessionMode =
  | "drill"
  | "review"
  | "learn"
  | "weakest"
  | "cram"
  | "missed";

/**
 * Hierarchical. A "container" groups other collections (Network+, Module 3).
 * A "training" collection is a small drill deck (20-40 cards) that gets
 * promoted into the nearest "master" collection once it qualifies.
 */
export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id").references((): AnySQLiteColumn => collections.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    kind: text("kind").$type<CollectionKind>().notNull().default("general"),
    role: text("role").$type<CollectionRole>().notNull().default("container"),
    description: text("description"),
    examDate: integer("exam_date", { mode: "timestamp_ms" }),
    position: integer("position").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    // Promotion rule for training decks.
    qualifyPasses: integer("qualify_passes").notNull().default(1),
    qualifyDistinctDays: integer("qualify_distinct_days", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  (t) => [index("collections_parent_idx").on(t.parentId)],
);

export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cardType: text("card_type").$type<CardType>().notNull().default("basic"),
  promptMarkdown: text("prompt_markdown").notNull(),
  answerMarkdown: text("answer_markdown").notNull(),
  explanationMarkdown: text("explanation_markdown"),
  source: text("source"),
  lifecycle: text("lifecycle").$type<Lifecycle>().notNull().default("new"),
  suspended: integer("suspended", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

/**
 * A card can live in several collections at once (its training deck and the
 * master deck) without being duplicated, so review history is shared.
 */
export const collectionCards = sqliteTable(
  "collection_cards",
  {
    collectionId: integer("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    promotedFromCollectionId: integer("promoted_from_collection_id").references(
      () => collections.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.cardId] }),
    index("collection_cards_card_idx").on(t.cardId),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("tags_name_idx").on(t.name)],
);

export const cardTags = sqliteTable(
  "card_tags",
  {
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.tagId] })],
);

/** Official exam objectives. Hierarchical (domain -> objective). */
export const objectives = sqliteTable("objectives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  parentId: integer("parent_id").references((): AnySQLiteColumn => objectives.id, {
    onDelete: "cascade",
  }),
  code: text("code"),
  title: text("title").notNull(),
  description: text("description"),
  examWeight: real("exam_weight"),
});

export const cardObjectives = sqliteTable(
  "card_objectives",
  {
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    objectiveId: integer("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.cardId, t.objectiveId] })],
);

/** FSRS memory state. Only populated once a card enters a master deck. */
export const cardProgress = sqliteTable(
  "card_progress",
  {
    cardId: integer("card_id")
      .primaryKey()
      .references(() => cards.id, { onDelete: "cascade" }),
    state: integer("state").notNull().default(0),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    lastReviewAt: integer("last_review_at", { mode: "timestamp_ms" }),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
  },
  (t) => [index("card_progress_due_idx").on(t.dueAt)],
);

export const studySessions = sqliteTable("study_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id").references(() => collections.id, {
    onDelete: "set null",
  }),
  mode: text("mode").$type<SessionMode>().notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  endedAt: integer("ended_at", { mode: "timestamp_ms" }),
});

/** Immutable answer log. Everything analytical derives from this. */
export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    sessionId: integer("session_id").references(() => studySessions.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<ReviewKind>().notNull(),
    // 1 Again, 2 Hard, 3 Good, 4 Easy. Drill maps missed -> 1, got it -> 3.
    rating: integer("rating").notNull(),
    // Nth time this card was answered within its session (1 = first try).
    attempt: integer("attempt").notNull().default(1),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    elapsedDays: integer("elapsed_days"),
    responseTimeMs: integer("response_time_ms"),
  },
  (t) => [
    index("reviews_card_idx").on(t.cardId, t.reviewedAt),
    index("reviews_session_idx").on(t.sessionId),
  ],
);

export const collectionsRelations = relations(collections, ({ many }) => ({
  collectionCards: many(collectionCards),
}));

export const cardsRelations = relations(cards, ({ many, one }) => ({
  collectionCards: many(collectionCards),
  cardTags: many(cardTags),
  progress: one(cardProgress, {
    fields: [cards.id],
    references: [cardProgress.cardId],
  }),
}));

export const collectionCardsRelations = relations(collectionCards, ({ one }) => ({
  collection: one(collections, {
    fields: [collectionCards.collectionId],
    references: [collections.id],
  }),
  card: one(cards, {
    fields: [collectionCards.cardId],
    references: [cards.id],
  }),
}));

export const cardTagsRelations = relations(cardTags, ({ one }) => ({
  card: one(cards, { fields: [cardTags.cardId], references: [cards.id] }),
  tag: one(tags, { fields: [cardTags.tagId], references: [tags.id] }),
}));
