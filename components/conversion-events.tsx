"use client";

import { useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { addConversionEvent, removeConversionEvent } from "@/app/(dashboard)/settings/actions";

export function ConversionEventsManager({
  siteId,
  events,
}: {
  siteId: string;
  events: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addConversionEvent(formData);
        formRef.current?.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add event.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {events.length === 0 && <p className="text-sm text-[var(--muted)]">No conversion events configured yet.</p>}
        {events.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
          >
            {name}
            <button
              onClick={() => startTransition(() => removeConversionEvent(siteId, name))}
              className="text-green-700/60 hover:text-green-900"
              aria-label={`Remove ${name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <form ref={formRef} action={handleAdd} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="siteId" value={siteId} />
        <input
          name="eventName"
          placeholder="e.g. contact_form_submit"
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] sm:w-64"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
    </div>
  );
}
