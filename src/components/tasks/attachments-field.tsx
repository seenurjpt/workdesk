"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, ExternalLink, Link2, Plus, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invalidateTaskQueries } from "@/hooks/use-task-mutations";
import { MAX_ATTACHMENTS_PER_TASK } from "@/lib/limits";
import { classifyUrl, parseHttpUrl } from "@/lib/url-links";
import type { AttachmentDTO } from "@/lib/types";
import { addAttachmentAction, removeAttachmentAction } from "@/server/actions";

const KIND_LABEL = { link: "Link", jira: "Jira", confluence: "Confluence" } as const;

function Favicon({ url, kind }: { url: string; kind: AttachmentDTO["kind"] }) {
  const [failed, setFailed] = useState(false);
  const Fallback = kind === "jira" ? Ticket : kind === "confluence" ? BookOpen : Link2;
  const origin = parseHttpUrl(url)?.origin;
  if (failed || !origin || kind !== "link")
    return <Fallback className="text-muted-strong size-4 shrink-0" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${origin}/favicon.ico`}
      alt=""
      width={16}
      height={16}
      className="size-4 shrink-0"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}

export function AttachmentsField({
  taskId,
  initial,
}: {
  taskId: string;
  initial: AttachmentDTO[];
}) {
  const qc = useQueryClient();
  const [items, setItems] = useState(initial);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(raw: string) {
    const url = raw.trim();
    if (!url || busy) return;
    setBusy(true);
    const res = await addAttachmentAction({ taskId, url });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setItems(res.data);
    setValue("");
    invalidateTaskQueries(qc);
  }

  async function remove(id: string) {
    const res = await removeAttachmentAction({ taskId, attachmentId: id });
    if (!res.ok) return void toast.error(res.error);
    setItems(res.data);
    invalidateTaskQueries(qc);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-body-sm mb-1 flex items-center gap-2 font-semibold">
        <Link2 className="size-4" aria-hidden /> Links
      </legend>
      {items.length > 0 && (
        <ul aria-label="Attached links" className="space-y-1">
          {items.map((a) => (
            <li key={a.id} className="bg-surface-soft flex items-center gap-2 rounded-xl px-3 py-2">
              <Favicon url={a.url} kind={a.kind} />
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-body-sm text-accent-text min-w-0 flex-1 truncate font-semibold hover:underline"
                title={a.url}
              >
                {a.title}
              </a>
              <span className="text-caption bg-surface text-muted-strong shrink-0 rounded-full px-2 py-0.5">
                {KIND_LABEL[a.kind]}
              </span>
              <ExternalLink className="text-muted-strong size-3.5 shrink-0" aria-hidden />
              <Button
                variant="utility"
                size="iconSm"
                aria-label={`Remove link ${a.title}`}
                onClick={() => void remove(a.id)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {items.length < MAX_ATTACHMENTS_PER_TASK && (
        <div className="flex gap-2">
          <Input
            type="url"
            aria-label="Add a link"
            placeholder="Paste a link (Jira, Confluence or any page)"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => {
              // Jira and Confluence links are recognised on paste and added straight away.
              const text = e.clipboardData.getData("text").trim();
              const url = parseHttpUrl(text);
              if (url && classifyUrl(url).kind !== "link") {
                e.preventDefault();
                void add(text);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add(value);
              }
            }}
          />
          <Button
            variant="secondary"
            disabled={busy || !value.trim()}
            onClick={() => void add(value)}
          >
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </div>
      )}
    </fieldset>
  );
}
