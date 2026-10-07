# IntelliStudy

Personal flashcards for certification exams and graduate courses. Single user, local-first, no accounts.

## Study model

```
Subject (Network+)
├── Training deck (DNS, 20-40 cards)   -> drill until 100%
├── Training deck (Subnetting)
└── Master Deck                         -> FSRS daily review (commute)
```

1. **Acquire** - drill a small training deck. A pass is "perfect" when every card is right on its first try.
2. **Promote** - once a deck meets its rule (N perfect passes, optionally on different days), add its cards to the master deck. Cards are shared, not copied, so history follows them.
3. **Retain** - the master deck is scheduled by [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) (Again / Hard / Good / Easy).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

The SQLite database lives at `data/intellistudy.db` (gitignored) and migrates itself on startup. Back it up by copying the file. Set `INTELLISTUDY_DB` to use another path.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run db:generate` | Generate a migration after editing `db/schema.ts` |
| `npm run smoke` | End-to-end domain check (drill, qualify, promote, FSRS) on a throwaway DB |
| `npm run lint` | ESLint |

## Study keys

- `Space` reveal, then `Space` again = Good (review) / Got it (drill)
- Review: `1` Again, `2` Hard, `3` Good, `4` Easy
- Drill / cram: `1` or Left = Missed, `2` or Right = Got it
- `S` suspend card, `E` edit card, `Esc` leave without finishing

## Layout

- `db/schema.ts` - tables (collections, cards, collection_cards, tags, objectives, card_progress, reviews, study_sessions)
- `lib/library.ts` - queries, deck status and promotion-rule evaluation
- `lib/queue.ts` - study queues (drill, review, weakest, cram)
- `lib/fsrs.ts` - thin wrapper around `ts-fsrs`
- `lib/actions.ts` - server actions (all writes)
- `app/` - dashboard, library, collection, card, study pages
