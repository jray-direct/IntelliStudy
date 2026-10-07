"use client";

import { useRef, type ReactNode } from "react";
import { btnPrimary } from "@/components/ui";

export function AddCardForm({
  action,
  collectionId,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  collectionId: number;
  children: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        await action(fd);
        formRef.current?.querySelector<HTMLTextAreaElement>("#prompt")?.focus();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          formRef.current?.requestSubmit();
        }
      }}
      className="grid gap-3"
    >
      <input type="hidden" name="collectionId" value={collectionId} />
      {children}
      <div className="flex items-center gap-3">
        <button className={btnPrimary}>Add card</button>
        <span className="text-xs text-zinc-500">Ctrl+Enter to save and add another</span>
      </div>
    </form>
  );
}
