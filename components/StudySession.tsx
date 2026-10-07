"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  answerDrill,
  answerReview,
  finishSession,
  promoteDeck,
  startSession,
  toggleSuspend,
  type SessionResult,
} from "@/lib/actions";
import type { StudyCard, StudyMode } from "@/lib/queue";
import { Markdown } from "@/components/Markdown";
import { ProgressBar, btnPrimary, btnSecondary } from "@/components/ui";

type Item = { card: StudyCard; attempt: number };
type Tally = { total: number; correct: number };

const MODE_LABEL: Record<StudyMode, string> = {
  drill: "Drill",
  review: "Review",
  weakest: "Weakest cards",
  cram: "Cram",
};

const FSRS_BUTTONS: Array<{ rating: 1 | 2 | 3 | 4; label: string; cls: string }> = [
  { rating: 1, label: "Again", cls: "bg-red-600 hover:bg-red-500" },
  { rating: 2, label: "Hard", cls: "bg-amber-600 hover:bg-amber-500" },
  { rating: 3, label: "Good", cls: "bg-emerald-600 hover:bg-emerald-500" },
  { rating: 4, label: "Easy", cls: "bg-sky-600 hover:bg-sky-500" },
];

export function StudySession({
  mode,
  collectionId,
  title,
  returnHref,
  studyHref,
  cards,
}: {
  mode: StudyMode;
  collectionId: number | null;
  title: string;
  returnHref: string;
  studyHref: string;
  cards: StudyCard[];
}) {
  const router = useRouter();
  const usesFsrs = mode === "review" || mode === "weakest";

  const [queue, setQueue] = useState<Item[]>(() => cards.map((card) => ({ card, attempt: 1 })));
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState<Tally>({ total: 0, correct: 0 });
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [promoted, setPromoted] = useState(false);
  const [elapsedMin, setElapsedMin] = useState(1);

  const sessionRef = useRef<Promise<number> | null>(null);
  const shownAt = useRef(0);
  const flipMs = useRef<number | null>(null);
  const busy = useRef(false);
  const startedAt = useRef(0);

  useEffect(() => {
    shownAt.current = performance.now();
    startedAt.current = Date.now();
  }, []);

  const getSession = useCallback(() => {
    sessionRef.current ??= startSession(collectionId, mode);
    return sessionRef.current;
  }, [collectionId, mode]);

  const total = cards.length;
  const remaining = useMemo(() => new Set(queue.map((i) => i.card.id)).size, [queue]);
  const current = queue[0];

  const complete = useCallback(async () => {
    const sid = sessionRef.current ? await sessionRef.current : null;
    setElapsedMin(Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000)));
    setResult(sid ? await finishSession(sid) : null);
    setDone(true);
  }, []);

  const reveal = useCallback(() => {
    if (!current || revealed) return;
    flipMs.current = Math.round(performance.now() - shownAt.current);
    setRevealed(true);
  }, [current, revealed]);

  const advance = useCallback(
    async (next: Item[]) => {
      setQueue(next);
      setRevealed(false);
      flipMs.current = null;
      shownAt.current = performance.now();
      if (next.length === 0) await complete();
    },
    [complete],
  );

  const gradeBinary = useCallback(
    async (correct: boolean) => {
      if (!current || !revealed || busy.current) return;
      busy.current = true;
      try {
        const sessionId = await getSession();
        await answerDrill({
          sessionId,
          cardId: current.card.id,
          correct,
          attempt: current.attempt,
          responseTimeMs: flipMs.current,
          countsTowardLifecycle: mode === "drill",
        });
        if (current.attempt === 1) {
          setTally((t) => ({ total: t.total + 1, correct: t.correct + (correct ? 1 : 0) }));
        }
        const rest = queue.slice(1);
        if (!correct) {
          rest.splice(Math.min(rest.length, 4), 0, { card: current.card, attempt: current.attempt + 1 });
        }
        await advance(rest);
      } finally {
        busy.current = false;
      }
    },
    [advance, current, getSession, mode, queue, revealed],
  );

  const gradeFsrs = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!current || !revealed || busy.current) return;
      busy.current = true;
      try {
        const sessionId = await getSession();
        const res = await answerReview({
          sessionId,
          cardId: current.card.id,
          rating,
          attempt: current.attempt,
          responseTimeMs: flipMs.current,
        });
        if (current.attempt === 1) {
          setTally((t) => ({ total: t.total + 1, correct: t.correct + (rating >= 2 ? 1 : 0) }));
        }
        const rest = queue.slice(1);
        if (res.requeue) {
          rest.splice(Math.min(rest.length, 4), 0, {
            card: { ...current.card, previews: res.previews },
            attempt: current.attempt + 1,
          });
        }
        await advance(rest);
      } finally {
        busy.current = false;
      }
    },
    [advance, current, getSession, queue, revealed],
  );

  const suspendCurrent = useCallback(async () => {
    if (!current || busy.current) return;
    busy.current = true;
    try {
      const fd = new FormData();
      fd.set("id", String(current.card.id));
      await toggleSuspend(fd);
      await advance(queue.filter((i) => i.card.id !== current.card.id));
    } finally {
      busy.current = false;
    }
  }, [advance, current, queue]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.key === "Escape") {
        router.push(returnHref);
        return;
      }
      if (done || !current) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) reveal();
        else if (usesFsrs) void gradeFsrs(3);
        else void gradeBinary(true);
        return;
      }
      if (e.key === "s" || e.key === "S") {
        void suspendCurrent();
        return;
      }
      if (e.key === "e" || e.key === "E") {
        router.push(`/cards/${current.card.id}?returnTo=${encodeURIComponent(studyHref)}`);
        return;
      }
      if (!revealed) return;
      if (usesFsrs) {
        if (["1", "2", "3", "4"].includes(e.key)) void gradeFsrs(Number(e.key) as 1 | 2 | 3 | 4);
      } else if (e.key === "1" || e.key === "ArrowLeft") {
        void gradeBinary(false);
      } else if (e.key === "2" || e.key === "ArrowRight") {
        void gradeBinary(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (total === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-xl font-semibold">Nothing to study</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {mode === "review" ? "No cards are due. Nice." : "This deck has no active cards."}
        </p>
        <Link href={returnHref} className={`${btnSecondary} mt-6`}>
          Back
        </Link>
      </div>
    );
  }

  if (done) {
    const perfect = tally.total > 0 && tally.correct === tally.total;
    const qualified = result?.qualified && result.status !== "mastered";
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-semibold">{perfect ? "Perfect pass" : "Session complete"}</h1>
        <p className="mt-3 text-zinc-500">
          {tally.correct}/{tally.total} correct on the first try · {elapsedMin} min
        </p>
        {mode === "drill" && result && (
          <p className="mt-2 text-sm">
            {qualified
              ? "This deck now meets your promotion rule."
              : result.status === "mastered"
                ? "Every card is already in the master deck."
                : "Not at 100% yet. Run it again."}
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {qualified && collectionId && !promoted && (
            <button
              className={btnPrimary}
              onClick={async () => {
                const fd = new FormData();
                fd.set("id", String(collectionId));
                await promoteDeck(fd);
                setPromoted(true);
              }}
            >
              Add to Master
            </button>
          )}
          {promoted && <span className="self-center text-sm text-emerald-600">Added to master deck.</span>}
          {mode === "drill" && !qualified && (
            <button className={btnPrimary} onClick={() => window.location.reload()}>
              Drill again
            </button>
          )}
          <Link href={returnHref} className={btnSecondary}>
            Done
          </Link>
        </div>
      </div>
    );
  }

  const previews = current.card.previews;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-2xl flex-col">
      <div className="mb-4 flex items-center gap-3 text-xs text-zinc-500">
        <Link href={returnHref} className="hover:underline">
          Esc
        </Link>
        <span className="font-medium text-zinc-700 dark:text-zinc-300">
          {MODE_LABEL[mode]} · {title}
        </span>
        <span className="ml-auto">
          {total - remaining}/{total}
        </span>
      </div>
      <ProgressBar value={total - remaining} max={total} />

      <div
        className="mt-6 flex flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900/50 sm:p-10"
        onClick={reveal}
      >
        {current.attempt > 1 && (
          <span className="mb-3 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            retry
          </span>
        )}
        <Markdown className="text-2xl leading-snug font-medium sm:text-3xl">{current.card.prompt}</Markdown>

        {revealed && (
          <div className="mt-8 w-full border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <Markdown className="text-2xl text-indigo-600 dark:text-indigo-400 sm:text-3xl">
              {current.card.answer}
            </Markdown>
            {current.card.explanation && (
              <Markdown className="mt-5 text-sm text-zinc-600 dark:text-zinc-400">{current.card.explanation}</Markdown>
            )}
            {current.card.source && <p className="mt-3 text-xs text-zinc-500">{current.card.source}</p>}
          </div>
        )}
      </div>

      <div className="mt-4">
        {!revealed ? (
          <button className={`${btnPrimary} w-full py-4 text-base`} onClick={reveal}>
            Show answer <kbd className="ml-2 text-xs opacity-70">Space</kbd>
          </button>
        ) : usesFsrs ? (
          <div className="grid grid-cols-4 gap-2">
            {FSRS_BUTTONS.map((b) => (
              <button
                key={b.rating}
                onClick={() => void gradeFsrs(b.rating)}
                className={`${b.cls} rounded-lg px-2 py-3 text-white transition-colors`}
              >
                <div className="font-medium">{b.label}</div>
                <div className="text-xs opacity-80">{previews?.[b.rating] ?? ""}</div>
                <div className="text-[10px] opacity-60">{b.rating}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void gradeBinary(false)}
              className="rounded-lg bg-red-600 px-2 py-4 text-white transition-colors hover:bg-red-500"
            >
              Missed <span className="ml-1 text-xs opacity-70">1</span>
            </button>
            <button
              onClick={() => void gradeBinary(true)}
              className="rounded-lg bg-emerald-600 px-2 py-4 text-white transition-colors hover:bg-emerald-500"
            >
              Got it <span className="ml-1 text-xs opacity-70">2</span>
            </button>
          </div>
        )}
        <p className="mt-3 text-center text-xs text-zinc-500">
          S suspend · E edit · Esc exit without finishing
        </p>
      </div>
    </div>
  );
}
