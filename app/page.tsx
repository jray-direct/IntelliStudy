import Link from "next/link";
import { promoteDeck } from "@/lib/actions";
import {
  getAllCollections,
  getAncestors,
  reviewsToday,
  summarizeMaster,
  summarizeTrainingDeck,
} from "@/lib/library";
import { ButtonLink, Card, PageHeader, ProgressBar, StatusBadge, btnPrimary } from "@/components/ui";

export default function Dashboard() {
  const rows = getAllCollections();
  const label = (id: number) =>
    [...getAncestors(id, rows).map((a) => a.name), rows.find((r) => r.id === id)!.name].join(" / ");

  const trainingDecks = rows
    .filter((r) => r.role === "training" && !r.archived)
    .map(summarizeTrainingDeck)
    .filter((d) => d.status !== "empty");
  const inProgress = trainingDecks.filter((d) => d.status === "not_started" || d.status === "learning");
  const qualified = trainingDecks.filter((d) => d.status === "qualified");

  const masters = rows.filter((r) => r.role === "master").map((m) => summarizeMaster(m));
  const totalDue = masters.reduce((n, m) => n + m.due, 0);
  const today = reviewsToday();

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Nothing here yet." />
        <Card>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Start by creating a subject like <em>Network+</em> or <em>CS 6035</em>. Each subject gets a master deck,
            and you add small training decks (20-40 cards) underneath it.
          </p>
          <ButtonLink href="/library" variant="primary" className="mt-4">
            Create your first subject
          </ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${today} card${today === 1 ? "" : "s"} answered today`}>
        {totalDue > 0 && masters.length > 1 && (
          <ButtonLink href="/study?collection=all&mode=review" variant="primary">
            Review all masters ({totalDue} due)
          </ButtonLink>
        )}
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            1. Training decks not at 100%
          </h2>
          {inProgress.length === 0 ? (
            <p className="text-sm text-zinc-500">Every training deck is qualified or mastered.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {inProgress.map((d) => (
                <li key={d.collection.id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/collections/${d.collection.id}`} className="font-medium hover:underline">
                      {label(d.collection.id)}
                    </Link>
                    <div className="mt-1.5 flex items-center gap-3">
                      <div className="w-40">
                        <ProgressBar value={d.lastScore?.correct ?? 0} max={d.total} />
                      </div>
                      <span className="text-xs text-zinc-500">
                        {d.lastScore ? `${d.lastScore.correct}/${d.lastScore.total} last pass` : `${d.total} cards`}
                        {d.passesNeeded > 1 && ` · ${d.perfectStreak}/${d.passesNeeded} perfect passes`}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                  <ButtonLink href={`/study?collection=${d.collection.id}&mode=drill`} variant="primary">
                    Drill
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            2. Qualified, waiting for promotion
          </h2>
          {qualified.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing waiting. Hit 100% on a training deck and it shows up here.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {qualified.map((d) => (
                <li key={d.collection.id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/collections/${d.collection.id}`} className="font-medium hover:underline">
                      {label(d.collection.id)}
                    </Link>
                    <p className="text-xs text-zinc-500">{d.total - d.promoted} cards ready for the master deck</p>
                  </div>
                  <form action={promoteDeck}>
                    <input type="hidden" name="id" value={d.collection.id} />
                    <button className={btnPrimary}>Add to Master</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">3. Master review</h2>
          {masters.length === 0 ? (
            <p className="text-sm text-zinc-500">No master decks yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {masters.map((m) => (
                <li key={m.collection.id} className="flex flex-wrap items-center gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/collections/${m.collection.id}`} className="font-medium hover:underline">
                      {label(m.collection.parentId ?? m.collection.id)}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {m.total} cards · {m.due} due
                      {m.avgRetrievability !== null &&
                        ` · ${Math.round(m.avgRetrievability * 100)}% predicted recall`}
                    </p>
                  </div>
                  {m.total > 0 && (
                    <>
                      <ButtonLink href={`/study?collection=${m.collection.id}&mode=cram`}>Cram</ButtonLink>
                      <ButtonLink href={`/study?collection=${m.collection.id}&mode=weakest`}>Weakest</ButtonLink>
                      <ButtonLink href={`/study?collection=${m.collection.id}&mode=review`} variant="primary">
                        Review {m.due} due
                      </ButtonLink>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
