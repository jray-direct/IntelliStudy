import { input, label } from "@/components/ui";

const CARD_TYPES = [
  "basic",
  "definition",
  "command",
  "scenario",
  "true_false",
  "fill_blank",
  "multiple_choice",
] as const;

export type CardDefaults = {
  prompt?: string;
  answer?: string;
  explanation?: string | null;
  source?: string | null;
  cardType?: string;
  tags?: string;
};

export function CardFields({ defaults = {} }: { defaults?: CardDefaults }) {
  return (
    <div className="grid gap-3">
      <div>
        <label className={label} htmlFor="prompt">
          Prompt (Markdown)
        </label>
        <textarea
          id="prompt"
          name="prompt"
          required
          rows={3}
          defaultValue={defaults.prompt}
          placeholder="What port does DNS use?"
          className={input}
        />
      </div>
      <div>
        <label className={label} htmlFor="answer">
          Answer (Markdown)
        </label>
        <textarea id="answer" name="answer" required rows={3} defaultValue={defaults.answer} placeholder="53" className={input} />
      </div>
      <div>
        <label className={label} htmlFor="explanation">
          Explanation (optional)
        </label>
        <textarea
          id="explanation"
          name="explanation"
          rows={2}
          defaultValue={defaults.explanation ?? ""}
          placeholder="UDP 53 for queries, TCP 53 for zone transfers and large responses."
          className={input}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="cardType">
            Type
          </label>
          <select id="cardType" name="cardType" defaultValue={defaults.cardType ?? "basic"} className={input}>
            {CARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="source">
            Source
          </label>
          <input
            id="source"
            name="source"
            defaultValue={defaults.source ?? ""}
            placeholder="N10-009 Obj 1.4"
            className={input}
          />
        </div>
        <div>
          <label className={label} htmlFor="tags">
            Tags (comma separated)
          </label>
          <input id="tags" name="tags" defaultValue={defaults.tags} placeholder="dns, port" className={input} />
        </div>
      </div>
    </div>
  );
}
