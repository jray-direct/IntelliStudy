import { redirect } from "next/navigation";
import { getAllCollections, getAncestors, getCollection } from "@/lib/library";
import { buildQueue, resolveTargets, STUDY_MODES, type StudyMode } from "@/lib/queue";
import { StudySession } from "@/components/StudySession";

export default async function StudyPage({ searchParams }: PageProps<"/study">) {
  const sp = await searchParams;
  const collectionParam = typeof sp.collection === "string" ? sp.collection : "all";
  const mode = (typeof sp.mode === "string" ? sp.mode : "review") as StudyMode;
  if (!STUDY_MODES.includes(mode)) redirect("/");

  const targets = resolveTargets(collectionParam, mode);
  const single = collectionParam !== "all" ? getCollection(Number(collectionParam)) : undefined;

  let title = "All master decks";
  if (single) {
    const rows = getAllCollections();
    const subject = single.role === "master" ? getAncestors(single.id, rows).at(-1) : undefined;
    title = subject ? subject.name : single.name;
  }

  const cards = buildQueue(mode, targets);
  const returnHref = single ? `/collections/${single.id}` : "/";
  const studyHref = `/study?collection=${collectionParam}&mode=${mode}`;

  return (
    <StudySession
      key={`${collectionParam}-${mode}`}
      mode={mode}
      collectionId={single?.id ?? null}
      title={title}
      returnHref={returnHref}
      studyHref={studyHref}
      cards={cards}
    />
  );
}
