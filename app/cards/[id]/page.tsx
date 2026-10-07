import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { deleteCard, toggleSuspend, updateCard } from "@/lib/actions";
import { db, schema } from "@/lib/db";
import { getCard, getCardCollections } from "@/lib/library";
import { CardFields } from "@/components/CardFields";
import { Card, PageHeader, btnDanger, btnPrimary, btnSecondary } from "@/components/ui";

const RATING = ["", "Again", "Hard", "Good", "Easy"];

export default async function CardPage({ params, searchParams }: PageProps<"/cards/[id]">) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = Number(rawId);
  const card = Number.isFinite(id) ? getCard(id) : undefined;
  if (!card) notFound();

  const returnTo = typeof sp.returnTo === "string" && sp.returnTo.startsWith("/") ? sp.returnTo : "/library";
  const memberOf = getCardCollections(id);
  const history = db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.cardId, id))
    .orderBy(desc(schema.reviews.reviewedAt))
    .limit(15)
    .all();
  const progress = db.select().from(schema.cardProgress).where(eq(schema.cardProgress.cardId, id)).get();

  return (
    <>
      <PageHeader
        title="Edit card"
        subtitle={
          <>
            In:{" "}
            {memberOf.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/collections/${c.id}`} className="hover:underline">
                  {c.name}
                </Link>
              </span>
            ))}
            {card.suspended && " · suspended"}
          </>
        }
      >
        <Link href={returnTo} className={btnSecondary}>
          Back
        </Link>
      </PageHeader>

      <Card className="mb-6">
        <form action={updateCard} className="grid gap-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <CardFields
            defaults={{
              prompt: card.promptMarkdown,
              answer: card.answerMarkdown,
              explanation: card.explanationMarkdown,
              source: card.source,
              cardType: card.cardType,
              tags: card.tags.join(", "),
            }}
          />
          <div>
            <button className={btnPrimary}>Save</button>
          </div>
        </form>
        <div className="mt-6 flex gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <form action={toggleSuspend}>
            <input type="hidden" name="id" value={id} />
            <button className={btnSecondary}>{card.suspended ? "Unsuspend" : "Suspend"}</button>
          </form>
          <form action={deleteCard}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className={btnDanger}>Delete card</button>
          </form>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">History</h2>
        {progress && progress.lastReviewAt && (
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Stability {progress.stability.toFixed(1)}d · difficulty {progress.difficulty.toFixed(1)} · {progress.reps}{" "}
            reps · {progress.lapses} lapses · due {progress.dueAt.toLocaleString()}
          </p>
        )}
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">No reviews yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {history.map((r) => (
              <li key={r.id} className="flex gap-4">
                <span className="w-44 text-zinc-500">{r.reviewedAt.toLocaleString()}</span>
                <span className="w-16">{r.kind === "drill" ? (r.rating >= 3 ? "Got it" : "Missed") : RATING[r.rating]}</span>
                <span className="text-zinc-500">{r.kind}</span>
                {r.responseTimeMs !== null && (
                  <span className="text-zinc-500">{(r.responseTimeMs / 1000).toFixed(1)}s</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
