import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/notes/note-editor";
import { objectId } from "@/schemas";
import { getLinkedTasks, getNote, getNoteFacets } from "@/server/notes";
import { requireUserId } from "@/server/session";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage(props: PageProps<"/notes/[id]">) {
  const { id } = await props.params;
  if (!objectId.safeParse(id).success) notFound();
  const userId = await requireUserId();
  const [note, linkedTasks, facets] = await Promise.all([
    getNote(userId, id),
    getLinkedTasks(userId, id),
    getNoteFacets(userId),
  ]);
  if (!note) notFound();
  return (
    <NoteEditor
      key={note.id}
      note={note}
      linkedTasks={linkedTasks}
      folders={facets.folders.map((f) => f.name)}
    />
  );
}
