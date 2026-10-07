/* Domain smoke test: npm run smoke. Uses a throwaway database. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module from "node:module";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "intellistudy-"));
process.env.INTELLISTUDY_DB = path.join(tmp, "test.db");

const m = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const originalLoad = m._load;
m._load = function (req: string, ...rest: unknown[]) {
  if (req === "next/cache") return { revalidatePath() {} };
  if (req === "next/navigation") {
    return {
      redirect(url: string) {
        throw Object.assign(new Error("NEXT_REDIRECT"), { url });
      },
    };
  }
  return originalLoad.call(this, req, ...rest);
};

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok   ${msg}`);
}

async function redirected(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") return (e as { url: string }).url;
    throw e;
  }
  return null;
}

function form(obj: Record<string, string | number>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(obj)) fd.set(k, String(v));
  return fd;
}

async function main() {
  const actions = await import("../lib/actions");
  const lib = await import("../lib/library");
  const queue = await import("../lib/queue");

  const url = await redirected(() =>
    actions.createCollection(form({ name: "Network+", kind: "certification" })),
  );
  assert(url?.startsWith("/collections/"), "create subject redirects");
  const subject = lib.getAllCollections().find((c) => c.name === "Network+")!;
  const master = lib.getAllCollections().find((c) => c.role === "master")!;
  assert(master.parentId === subject.id, "subject auto-creates master deck");

  await redirected(() =>
    actions.createCollection(form({ name: "DNS", parentId: subject.id, role: "training" })),
  );
  const dns = lib.getAllCollections().find((c) => c.name === "DNS")!;
  assert(lib.findMasterFor(dns.id)?.id === master.id, "training deck resolves its master");

  await redirected(() =>
    actions.bulkCreateCards(
      form({
        collectionId: dns.id,
        bulk: "DNS port? | 53\nSSH port?\t22\nHTTPS port? | 443",
        tags: "port, DNS",
      }),
    ),
  );
  const cards = lib.listCards(dns.id);
  assert(cards.length === 3, "bulk import creates 3 cards");
  assert(cards[0].tags.join() === "DNS,port", "tags attached");
  assert(lib.summarizeTrainingDeck(dns).status === "not_started", "status: not started");

  async function drillPass(missFirst: boolean) {
    const sid = await actions.startSession(dns.id, "drill");
    for (const [i, c] of cards.entries()) {
      const miss = missFirst && i === 0;
      await actions.answerDrill({
        sessionId: sid,
        cardId: c.id,
        correct: !miss,
        attempt: 1,
        responseTimeMs: 800,
        countsTowardLifecycle: true,
      });
      if (miss) {
        await actions.answerDrill({
          sessionId: sid,
          cardId: c.id,
          correct: true,
          attempt: 2,
          responseTimeMs: 600,
          countsTowardLifecycle: true,
        });
      }
    }
    return actions.finishSession(sid);
  }

  const imperfect = await drillPass(true);
  assert(imperfect.status === "learning", "retry does not count as perfect (still learning)");
  assert(imperfect.lastScore?.correct === 2, "last score 2/3");

  const perfect = await drillPass(false);
  assert(perfect.status === "qualified", "perfect pass qualifies the deck");

  await actions.updateCollection(
    form({ id: dns.id, name: "DNS", qualifyPasses: 2, qualifyDistinctDays: "on" }),
  );
  const refreshed = lib.getCollection(dns.id)!;
  assert(lib.summarizeTrainingDeck(refreshed).status === "learning", "stricter rule un-qualifies (2 passes, distinct days)");
  await actions.updateCollection(form({ id: dns.id, name: "DNS", qualifyPasses: 1 }));

  await actions.promoteDeck(form({ id: dns.id }));
  assert(lib.listCards(master.id).length === 3, "promotion shares cards with master (no duplicates)");
  assert(lib.listCards(dns.id).length === 3, "cards remain in the training deck");
  assert(lib.summarizeTrainingDeck(lib.getCollection(dns.id)!).status === "mastered", "status: mastered");
  await actions.promoteDeck(form({ id: dns.id }));
  assert(lib.listCards(master.id).length === 3, "promotion is idempotent");

  const due = queue.buildQueue("review", [master.id]);
  assert(due.length === 3, "promoted cards are due for review");
  assert(due[0].previews !== null, "review cards carry FSRS interval previews");

  const sid = await actions.startSession(master.id, "review");
  const r = await actions.answerReview({
    sessionId: sid,
    cardId: due[0].id,
    rating: 3,
    attempt: 1,
    responseTimeMs: 900,
  });
  assert(r.dueAt > Date.now(), "FSRS schedules next review in the future");
  assert(queue.buildQueue("review", [master.id]).length === 2 || r.requeue, "answered card leaves due queue");

  const weakest = queue.buildQueue("weakest", [master.id]);
  assert(weakest.length === 1, "weakest mode only includes reviewed cards");

  await actions.toggleSuspend(form({ id: cards[1].id }));
  assert(queue.buildQueue("cram", [master.id]).length === 2, "suspended cards excluded");

  await redirected(() => actions.deleteCollection(form({ id: dns.id })));
  assert(lib.listCards(master.id).length === 3, "deleting training deck keeps cards promoted to master");

  console.log("\nAll smoke checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      // Windows keeps the SQLite file locked until the process exits; temp dir is disposable.
    }
  });
