import Link from "next/link";
import { createCollection } from "@/lib/actions";
import {
  buildTree,
  countCards,
  summarizeTrainingDeck,
  type TreeNode,
} from "@/lib/library";
import { Card, PageHeader, RoleBadge, StatusBadge, btnPrimary, input, label } from "@/components/ui";

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const training = node.role === "training" ? summarizeTrainingDeck(node) : null;
  return (
    <li>
      <div
        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <Link href={`/collections/${node.id}`} className="font-medium hover:underline">
          {node.name}
        </Link>
        <RoleBadge role={node.role} />
        {training && <StatusBadge status={training.status} />}
        {node.role !== "container" && (
          <span className="ml-auto text-xs text-zinc-500">{countCards(node.id)} cards</span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function LibraryPage() {
  const tree = buildTree();
  return (
    <>
      <PageHeader title="Library" subtitle="Subjects, training decks, and master decks" />

      <Card className="mb-6">
        {tree.length === 0 ? (
          <p className="text-sm text-zinc-500">No subjects yet. Create one below.</p>
        ) : (
          <ul className="space-y-0.5">
            {tree.map((n) => (
              <Node key={n.id} node={n} depth={0} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">New subject</h2>
        <form action={createCollection} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div>
            <label className={label} htmlFor="name">
              Name
            </label>
            <input id="name" name="name" required placeholder="CompTIA Network+" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="kind">
              Type
            </label>
            <select id="kind" name="kind" className={input} defaultValue="certification">
              <option value="certification">Certification</option>
              <option value="graduate_course">Graduate course</option>
              <option value="general">General</option>
            </select>
          </div>
          <button className={btnPrimary}>Create</button>
        </form>
        <p className="mt-3 text-xs text-zinc-500">A master deck is created automatically for each subject.</p>
      </Card>
    </>
  );
}
