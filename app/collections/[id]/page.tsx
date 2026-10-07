import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import {
  bulkCreateCards,
  createCard,
  createCollection,
  deleteCollection,
  promoteDeck,
  toggleSuspend,
  updateCollection,
} from "@/lib/actions";
import { db, schema } from "@/lib/db";
import {
  getAllCollections,
  getAncestors,
  getCollection,
  listCards,
  summarizeMaster,
  summarizeTrainingDeck,
} from "@/lib/library";
import { AddCardForm } from "@/components/AddCardForm";
import { CardFields } from "@/components/CardFields";
import { Markdown } from "@/components/Markdown";
import {
  ButtonLink,
  Card,
  PageHeader,
  ProgressBar,
  RoleBadge,
  StatusBadge,
  btnDanger,
  btnPrimary,
  btnSecondary,
  input,
  label,
} from "@/components/ui";

function dueLabel(due: Date, now: Date) {
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) return "due";
  const days = Math.round(diff / 86_400_000);
  return days < 1 ? "today" : `in ${days}d`;
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/collections/[id]">) {
  const { id: rawId } = await params;
  const sp = await searchParams;
  const id = Number(rawId);
  const collection = Number.isFinite(id) ? getCollection(id) : undefined;
  if (!collection) notFound();

  const rows = getAllCollections();
  const ancestors = getAncestors(id, rows);
  const children = rows.filter((r) => r.parentId === id);
  const cardList = collection.role === "container" ? [] : listCards(id);
  const now = new Date();

  const training = collection.role === "training" ? summarizeTrainingDeck(collection) : null;
  const master = collection.role === "master" ? summarizeMaster(collection, now) : null;

  const progress = new Map<number, typeof schema.cardProgress.$inferSelect>();
  if (master && cardList.length) {
    db.select()
      .from(schema.cardProgress)
      .where(
        inArray(
          schema.cardProgress.cardId,
          cardList.map((c) => c.id),
        ),
      )
      .all()
      .forEach((p) => progress.set(p.cardId, p));
  }

  const imported = typeof sp.imported === "string" ? Number(sp.imported) : null;

  return (
    <>
      <nav className="mb-2 text-xs text-zinc-500">
        <Link href="/library" className="hover:underline">
          Library
        </Link>
        {ancestors.map((a) => (
          <span key={a.id}>
            {" / "}
            <Link href={`/collections/${a.id}`} className="hover:underline">
              {a.name}
            </Link>
          </span>
        ))}
      </nav>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {collection.name}
            <RoleBadge role={collection.role} />
            {training && <StatusBadge status={training.status} />}
          </span>
        }
        subtitle={collection.description}
      >
        {training && training.total > 0 && (
          <ButtonLink href={`/study?collection=${id}&mode=drill`} variant="primary">
            Drill deck
          </ButtonLink>
        )}
        {training?.status === "qualified" && (
          <form action={promoteDeck}>
            <input type="hidden" name="id" value={id} />
            <button className={btnPrimary}>Add to Master</button>
          </form>
        )}
        {master && master.total > 0 && (
          <>
            <ButtonLink href={`/study?collection=${id}&mode=cram`}>Cram</ButtonLink>
            <ButtonLink href={`/study?collection=${id}&mode=weakest`}>Weakest</ButtonLink>
            <ButtonLink href={`/study?collection=${id}&mode=review`} variant="primary">
              Review {master.due} due
            </ButtonLink>
          </>
        )}
      </PageHeader>

      {imported !== null && (
        <p className="mb-4 rounded-md bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Imported {imported} card{imported === 1 ? "" : "s"}.
        </p>
      )}

      {training && training.total > 0 && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <strong>{training.total}</strong> cards
            </span>
            <span>
              Last pass:{" "}
              <strong>{training.lastScore ? `${training.lastScore.correct}/${training.lastScore.total}` : "none yet"}</strong>
            </span>
            <span>
              Perfect passes:{" "}
              <strong>
                {training.perfectStreak}/{training.passesNeeded}
              </strong>
            </span>
            <span>
              In master: <strong>{training.promoted}</strong>
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar
              value={training.promoted || training.lastScore?.correct || 0}
              max={training.total}
              tone={training.promoted ? "green" : "indigo"}
            />
          </div>
        </Card>
      )}

      {master && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              <strong>{master.total}</strong> cards
            </span>
            <span>
              <strong>{master.due}</strong> due
            </span>
            <span>
              <strong>{master.established}</strong> established
            </span>
            <span>
              <strong>{master.learning}</strong> still building
            </span>
            {master.avgRetrievability !== null && (
              <span>
                Predicted recall: <strong>{Math.round(master.avgRetrievability * 100)}%</strong>
              </span>
            )}
          </div>
        </Card>
      )}

      {collection.role === "container" && (
        <>
          <Card className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Contents</h2>
            {children.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing here yet. Add a training deck below.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {children.map((c) => {
                  const t = c.role === "training" ? summarizeTrainingDeck(c) : null;
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <Link href={`/collections/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <RoleBadge role={c.role} />
                      {t && <StatusBadge status={t.status} />}
                      {t && (
                        <span className="ml-auto text-xs text-zinc-500">
                          {t.total} cards{t.lastScore && ` · last ${t.lastScore.correct}/${t.lastScore.total}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <NewChildForm parentId={id} />
        </>
      )}

      {training && (
        <>
          <Card className="mb-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Add card</h2>
            <AddCardForm action={createCard} collectionId={id}>
              <CardFields />
            </AddCardForm>
          </Card>

          <Card className="mb-6">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">Bulk add</h2>
            <p className="mb-3 text-xs text-zinc-500">
              One card per line: <code>front | back</code> or tab separated. Paste straight from a spreadsheet.
            </p>
            <form action={bulkCreateCards} className="grid gap-3">
              <input type="hidden" name="collectionId" value={id} />
              <textarea
                name="bulk"
                required
                rows={6}
                className={`${input} font-mono`}
                placeholder={"What port does DNS use? | 53\nWhat port does SSH use? | 22"}
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label className={label} htmlFor="bulk-tags">
                    Tags for all (optional)
                  </label>
                  <input id="bulk-tags" name="tags" className={input} placeholder="port, memorization" />
                </div>
                <button className={btnSecondary}>Import</button>
              </div>
            </form>
          </Card>
        </>
      )}

      {collection.role !== "container" && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Cards ({cardList.length})
          </h2>
          {cardList.length === 0 ? (
            <p className="text-sm text-zinc-500">
              {collection.role === "master"
                ? "Cards arrive here when a training deck is promoted."
                : "No cards yet."}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {cardList.map((c) => {
                const p = progress.get(c.id);
                return (
                  <li key={c.id} className={`flex items-start gap-4 py-3 ${c.suspended ? "opacity-50" : ""}`}>
                    <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-6">
                      <Markdown className="text-sm font-medium">{c.promptMarkdown}</Markdown>
                      <Markdown className="text-sm text-zinc-600 dark:text-zinc-400">{c.answerMarkdown}</Markdown>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-zinc-500">
                      <div className="flex flex-wrap justify-end gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="rounded bg-zinc-200 px-1.5 py-0.5 dark:bg-zinc-800">
                            {t}
                          </span>
                        ))}
                      </div>
                      <span>{c.suspended ? "suspended" : c.lifecycle}</span>
                      {p && <span>{dueLabel(p.dueAt, now)}</span>}
                      <div className="flex gap-3">
                        <Link href={`/cards/${c.id}?returnTo=/collections/${id}`} className="hover:underline">
                          Edit
                        </Link>
                        <form action={toggleSuspend}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="hover:underline">{c.suspended ? "Unsuspend" : "Suspend"}</button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Settings</h2>
        <form action={updateCollection} className="grid gap-3">
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="s-name">
                Name
              </label>
              <input id="s-name" name="name" required defaultValue={collection.name} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="s-desc">
                Description
              </label>
              <input id="s-desc" name="description" defaultValue={collection.description ?? ""} className={input} />
            </div>
          </div>
          {training && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="s-passes">
                  Perfect passes required to qualify
                </label>
                <input
                  id="s-passes"
                  name="qualifyPasses"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={collection.qualifyPasses}
                  className={input}
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  name="qualifyDistinctDays"
                  defaultChecked={collection.qualifyDistinctDays}
                  className="h-4 w-4"
                />
                Passes must be on different days
              </label>
            </div>
          )}
          <div>
            <button className={btnSecondary}>Save settings</button>
          </div>
        </form>

        <form action={deleteCollection} className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <input type="hidden" name="id" value={id} />
          <button className={btnDanger}>Delete {collection.role === "container" ? "subject / folder" : "deck"}</button>
          <p className="mt-2 text-xs text-zinc-500">
            Cards that also live in another deck (for example the master deck) are kept.
          </p>
        </form>
      </Card>
    </>
  );
}

function NewChildForm({ parentId }: { parentId: number }) {
  return (
    <Card className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Add sub-deck</h2>
      <form action={createCollection} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <input type="hidden" name="parentId" value={parentId} />
        <div>
          <label className={label} htmlFor="child-name">
            Name
          </label>
          <input id="child-name" name="name" required placeholder="DNS" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="child-role">
            Kind
          </label>
          <select id="child-role" name="role" defaultValue="training" className={input}>
            <option value="training">Training deck (20-40 cards)</option>
            <option value="container">Folder (module / unit)</option>
          </select>
        </div>
        <button className={btnPrimary}>Create</button>
      </form>
    </Card>
  );
}
