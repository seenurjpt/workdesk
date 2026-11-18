import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Pin } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  NewMeetingNoteButton,
  NewNoteButton,
  NotesFilters,
} from "@/components/notes/notes-toolbar";
import { getNoteFacets, listNotes } from "@/server/notes";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Notes" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 100);

export default async function NotesPage(props: PageProps<"/notes">) {
  const sp = await props.searchParams;
  const filters = { q: first(sp.q), tag: first(sp.tag), folder: first(sp.folder) };
  const user = await requireUser();
  const [notes, facets] = await Promise.all([listNotes(user.id, filters), getNoteFacets(user.id)]);
  const filtered = Boolean(filters.q || filters.tag || filters.folder);

  return (
    <PageContainer>
      <PageHeader
        title="Notes"
        subtitle="Everything you write, searchable and linked to your tasks."
        actions={
          notes.length > 0 || filtered ? (
            <div className="flex flex-wrap gap-2">
              <NewMeetingNoteButton />
              <NewNoteButton variant="primary" />
            </div>
          ) : undefined
        }
      />
      <NotesFilters tags={facets.tags} folders={facets.folders} />

      {notes.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No matching notes"
            body="Try a different word, or clear the filters."
          />
        ) : (
          <EmptyState
            title="Your first note"
            body="Capture meeting notes, ideas and checklists. Autosave keeps every word."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <NewNoteButton />
                <NewMeetingNoteButton />
              </div>
            }
          />
        )
      ) : (
        <ul aria-label="Notes">
          {notes.map((n) => (
            <li
              key={n.id}
              className="border-border border-b py-1 transition-colors has-[a:focus-visible]:border-transparent has-[a:hover]:border-transparent"
            >
              <Link
                href={`/notes/${n.id}`}
                className="hover:bg-surface-soft -mx-3 block rounded-xl px-3 py-3 transition-colors duration-150"
              >
                <span className="flex items-center gap-2">
                  {n.pinned && (
                    <>
                      <Pin className="text-accent-text size-4 shrink-0" aria-hidden />
                      <span className="sr-only">Pinned.</span>
                    </>
                  )}
                  <span className="font-heading truncate text-xl font-semibold">
                    {n.title || "Untitled note"}
                  </span>
                </span>
                {n.excerpt && (
                  <span className="text-body-sm text-muted-strong mt-1 line-clamp-2 block">
                    {n.excerpt}
                  </span>
                )}
                <span className="text-caption text-muted-strong mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {formatInTimeZone(new Date(n.updatedAt), user.timezone, "d MMM yyyy, h:mm a")}
                  </span>
                  {n.folder && (
                    <span className="bg-surface-soft rounded-full px-2 py-0.5">{n.folder}</span>
                  )}
                  {n.tags.map((t) => (
                    <span key={t} className="bg-surface-soft rounded-full px-2 py-0.5">
                      @{t}
                    </span>
                  ))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
