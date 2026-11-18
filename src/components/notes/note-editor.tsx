"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTrashFx } from "@/components/shared/trash-bin";
import { Select } from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeft,
  Bold,
  Check,
  CheckSquare,
  Code2,
  Copy,
  Download,
  History,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Pin,
  PinOff,
  Printer,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/shared/user-context";
import { useTaskEditor } from "@/components/tasks/task-editor-context";
import { useAutosave, type SaveStatus } from "@/hooks/use-autosave";
import { useEvent } from "@/hooks/use-event";
import { plainJson } from "@/lib/tiptap";
import { cn } from "@/lib/utils";
import type { NoteDTO, TaskDTO } from "@/lib/types";
import type { NoteUpdate } from "@/schemas";
import {
  convertToTasksAction,
  deleteNoteAction,
  linkTaskNoteAction,
  restoreNoteAction,
  saveNoteAsTemplateAction,
  updateNoteAction,
} from "@/server/actions";
import { getTaskAction } from "@/server/queries";
import { buildExtensions, mentionClickProps } from "./editor-extensions";
import { LinkedTasks } from "./linked-tasks";
import { VersionHistory } from "./version-history";
import { MeetingDetails } from "./meeting-details";

function StatusIndicator({ status }: { status: SaveStatus }) {
  const map = {
    saved: { icon: Check, text: "Saved", tone: "text-muted-strong" },
    saving: { icon: Loader2, text: "Saving…", tone: "text-muted-strong" },
    unsaved: { icon: Loader2, text: "Unsaved changes", tone: "text-muted-strong" },
    error: {
      icon: AlertCircle,
      text: "Couldn't save. Retrying…",
      tone: "font-semibold text-danger",
    },
  } as const;
  const { icon: Icon, text, tone } = map[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("text-caption inline-flex items-center gap-1.5", tone)}
    >
      <Icon
        className={cn("size-3.5", status === "saving" && "animate-spin motion-reduce:animate-none")}
        aria-hidden
      />
      {text}
    </span>
  );
}

interface Props {
  note: NoteDTO;
  linkedTasks: TaskDTO[];
  folders: string[];
}

export function NoteEditor({ note, linkedTasks, folders }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const { projects, user } = useApp();
  const fx = useTrashFx();
  const { open: openTask } = useTaskEditor();

  const [title, setTitle] = useState(note.title);
  const [folder, setFolder] = useState(note.folder ?? "");
  const [tagsText, setTagsText] = useState(note.tags.join(", "));
  const [pinned, setPinned] = useState(note.pinned);
  const [projectId, setProjectId] = useState(note.projectId ?? "");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkBar, setLinkBar] = useState<string | null>(null);

  const { status, schedule, flush, readDraft } = useAutosave<NoteUpdate>(
    async (patch) => {
      const res = await updateNoteAction(note.id, patch);
      return res.ok;
    },
    { draftKey: `workdesk:note-draft:${note.id}` },
  );

  const handleContent = useEvent((json: Record<string, unknown>) => schedule({ content: json }));
  const handlePick = useEvent(async (kind: "task" | "note", item: { id: string }) => {
    if (kind !== "task") return;
    const res = await linkTaskNoteAction({ taskId: item.id, noteId: note.id });
    if (!res.ok) return void toast.error(res.error);
    void qc.invalidateQueries({ queryKey: ["links"] });
  });
  const handleOpen = useEvent(async (kind: "task" | "note", id: string) => {
    if (kind === "note") return void router.push(`/notes/${id}`);
    const res = await getTaskAction(id);
    if (res.ok) openTask(res.data);
    else toast.error("That task no longer exists");
  });

  const editor = useEditor({
    extensions: buildExtensions({
      placeholder: "Start writing… type / for blocks, @ to link a task, [[ to link a note",
      mentions: ["task", "note"],
      full: true,
      mentionHandlers: { onPick: handlePick },
    }),
    content: note.content,
    immediatelyRender: false,
    editorProps: {
      attributes: { "aria-label": "Note body", role: "textbox", "aria-multiline": "true" },
      ...mentionClickProps(() => handleOpen),
    },
    onCreate: ({ editor: e }) => {
      // Recover edits that never reached the server (tab closed or offline mid-save).
      const draft = readDraft();
      if (!draft || draft.at <= Date.parse(note.updatedAt)) return;
      if (draft.patch.title !== undefined) setTitle(draft.patch.title);
      if (draft.patch.content) e.commands.setContent(draft.patch.content, { emitUpdate: false });
      schedule(draft.patch);
      toast("Recovered unsaved changes", { description: "They are being saved now." });
    },
    onUpdate: ({ editor: e }) => handleContent(plainJson(e.getJSON()) as Record<string, unknown>),
  });

  /**
   * Turns the selected lines (or the line the cursor is on) into tasks linked to this note,
   * then marks each line with a task mention so the link is visible in the text.
   */
  async function convertSelection() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const lines: { text: string; end: number }[] = [];
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      let linked = false;
      node.descendants((child) => {
        if (child.type.name === "mention" && child.attrs.mentionSuggestionChar !== "[[")
          linked = true;
      });
      const text = node.textContent.trim();
      if (text && !linked) lines.push({ text, end: pos + node.nodeSize - 1 });
      return false;
    });
    if (lines.length === 0)
      return void toast.info("Select a line that isn't already a task, or put the cursor in one.");

    const res = await convertToTasksAction({ noteId: note.id, titles: lines.map((l) => l.text) });
    if (!res.ok) return void toast.error(res.error);
    const created = res.data;
    // insert from the end so earlier positions stay valid
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        [...lines].reverse().forEach((line, i) => {
          const task = created[lines.length - 1 - i];
          if (!task) return;
          const mention = state.schema.nodes.mention.create({
            id: task.id,
            label: task.title,
            mentionSuggestionChar: "@",
          });
          tr.insert(line.end, [state.schema.text(" "), mention]);
        });
        return true;
      })
      .run();
    toast.success(created.length === 1 ? "Task created" : `${created.length} tasks created`, {
      description: "Linked to this note.",
    });
    void qc.invalidateQueries({ queryKey: ["links"] });
    router.refresh();
  }

  async function saveAsTemplate() {
    await flush();
    const res = await saveNoteAsTemplateAction(note.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Saved as a template", { description: "Find it under Templates." });
  }

  const saveNow = (patch: NoteUpdate) => {
    schedule(patch);
    void flush();
  };

  function commitTags() {
    const tags = tagsText
      .split(/[,\s]+/)
      .map((t) => t.replace(/^[#@]/, "").trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
    setTagsText(tags.join(", "));
    saveNow({ tags });
  }

  async function remove() {
    fx.fly(note.id, title || "Untitled note");
    await flush();
    const res = await deleteNoteAction(note.id);
    if (!res.ok) return toast.error(res.error);
    toast("Note deleted", {
      description: title || "Untitled note",
      action: {
        label: "Undo",
        onClick: async () => {
          await restoreNoteAction(note.id);
          router.refresh();
        },
      },
    });
    router.push("/notes");
  }

  function applyLink() {
    if (!editor || linkBar === null) return;
    const raw = linkBar.trim();
    if (!raw) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else {
      const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkBar(null);
  }

  const tools = editor
    ? [
        {
          name: "Bold",
          icon: Bold,
          active: editor.isActive("bold"),
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          name: "Italic",
          icon: Italic,
          active: editor.isActive("italic"),
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          name: "Strikethrough",
          icon: Strikethrough,
          active: editor.isActive("strike"),
          run: () => editor.chain().focus().toggleStrike().run(),
        },
        {
          name: "Heading 1",
          label: "H1",
          active: editor.isActive("heading", { level: 1 }),
          run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        },
        {
          name: "Heading 2",
          label: "H2",
          active: editor.isActive("heading", { level: 2 }),
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          name: "Bullet list",
          icon: List,
          active: editor.isActive("bulletList"),
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          name: "Numbered list",
          icon: ListOrdered,
          active: editor.isActive("orderedList"),
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          name: "Checklist",
          icon: ListChecks,
          active: editor.isActive("taskList"),
          run: () => editor.chain().focus().toggleTaskList().run(),
        },
        {
          name: "Quote",
          icon: Quote,
          active: editor.isActive("blockquote"),
          run: () => editor.chain().focus().toggleBlockquote().run(),
        },
        {
          name: "Code block",
          icon: Code2,
          active: editor.isActive("codeBlock"),
          run: () => editor.chain().focus().toggleCodeBlock().run(),
        },
        {
          name: "Link",
          icon: Link2,
          active: editor.isActive("link"),
          run: () => setLinkBar((editor.getAttributes("link").href as string | undefined) ?? ""),
        },
        {
          name: "Insert table",
          icon: Table2,
          active: editor.isActive("table"),
          run: () =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
        },
        {
          name: "Convert to task",
          icon: CheckSquare,
          active: false,
          run: () => void convertSelection(),
        },
        {
          name: "Divider",
          icon: Minus,
          active: false,
          run: () => editor.chain().focus().setHorizontalRule().run(),
        },
        {
          name: "Undo",
          icon: Undo2,
          active: false,
          run: () => editor.chain().focus().undo().run(),
        },
        {
          name: "Redo",
          icon: Redo2,
          active: false,
          run: () => editor.chain().focus().redo().run(),
        },
      ]
    : [];

  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-8 px-4 py-6 md:px-8 lg:grid-cols-[minmax(0,1fr)_320px] print:block print:p-0">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <Button asChild variant="utility" size="sm">
            <Link href="/notes">
              <ArrowLeft className="size-4" aria-hidden /> Notes
            </Link>
          </Button>
          <StatusIndicator status={status} />
          <div className="ml-auto flex flex-wrap gap-1">
            <Button
              variant="utility"
              size="sm"
              aria-pressed={pinned}
              onClick={() => {
                setPinned(!pinned);
                saveNow({ pinned: !pinned });
              }}
            >
              {pinned ? (
                <PinOff className="size-4" aria-hidden />
              ) : (
                <Pin className="size-4" aria-hidden />
              )}
              {pinned ? "Unpin" : "Pin"}
            </Button>
            <Button variant="utility" size="sm" onClick={() => void saveAsTemplate()}>
              <Copy className="size-4" aria-hidden /> Template
            </Button>
            <Button asChild variant="utility" size="sm">
              <a href={`/api/export?type=note&id=${note.id}`} download>
                <Download className="size-4" aria-hidden /> Markdown
              </a>
            </Button>
            <Button variant="utility" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden /> PDF
            </Button>
            <Button variant="utility" size="sm" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" aria-hidden /> History
            </Button>
            <Button variant="utility" size="sm" onClick={remove}>
              <Trash2 className="size-4" aria-hidden /> Delete
            </Button>
          </div>
        </div>

        <label htmlFor="note-title" className="sr-only">
          Note title
        </label>
        <input
          id="note-title"
          data-fx-id={note.id}
          value={title}
          autoFocus={!note.title}
          maxLength={200}
          placeholder="Untitled note"
          onChange={(e) => {
            setTitle(e.target.value);
            schedule({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
          className="text-page-title placeholder:text-muted-strong focus-visible:border-focus w-full rounded-none border-0 border-b border-transparent bg-transparent py-1 focus-visible:border-b-2 focus-visible:outline-none"
        />

        {note.type === "meeting" && (
          <MeetingDetails
            initial={note.meeting}
            timezone={user.timezone}
            onChange={(meeting) => schedule({ meeting })}
          />
        )}

        <div className="my-4 grid gap-3 sm:grid-cols-3 print:hidden">
          <div>
            <label
              htmlFor="note-folder"
              className="text-caption text-muted-strong mb-1 block font-semibold"
            >
              Folder
            </label>
            <input
              id="note-folder"
              list="note-folders"
              value={folder}
              maxLength={80}
              onChange={(e) => setFolder(e.target.value)}
              onBlur={() => saveNow({ folder: folder.trim() || null })}
              className="border-border bg-surface focus-visible:outline-ring w-full rounded-2xl border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
            <datalist id="note-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div>
            <label
              htmlFor="note-project"
              className="text-caption text-muted-strong mb-1 block font-semibold"
            >
              Project
            </label>
            <Select
              id="note-project"
              value={projectId}
              onValueChange={(v) => {
                setProjectId(v);
                saveNow({ projectId: v || null });
              }}
              className="px-3 py-2 text-sm"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label
              htmlFor="note-tags"
              className="text-caption text-muted-strong mb-1 block font-semibold"
            >
              Tags
            </label>
            <input
              id="note-tags"
              value={tagsText}
              placeholder="meeting, ideas"
              onChange={(e) => setTagsText(e.target.value)}
              onBlur={commitTags}
              className="border-border bg-surface placeholder:text-muted-strong focus-visible:outline-ring w-full rounded-2xl border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
          </div>
        </div>

        <div className="border-border bg-surface focus-within:outline-ring rounded-2xl border focus-within:outline-2 focus-within:outline-offset-2 print:border-0">
          <div
            role="toolbar"
            aria-label="Formatting"
            className="border-border bg-surface sticky top-16 z-10 flex flex-wrap items-center gap-1 rounded-t-2xl border-b p-1 print:hidden"
          >
            {tools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                aria-label={tool.name}
                title={tool.name}
                aria-pressed={tool.active}
                onClick={tool.run}
                className={cn(
                  "hover:bg-surface-soft inline-flex size-9 items-center justify-center rounded-xl text-sm font-semibold",
                  tool.active && "bg-accent text-on-accent hover:bg-accent",
                )}
              >
                {"icon" in tool && tool.icon ? (
                  <tool.icon className="size-4" aria-hidden />
                ) : (
                  tool.label
                )}
              </button>
            ))}
            {editor?.isActive("table") && (
              <span
                className="border-border ml-2 flex gap-1 border-l pl-2"
                role="group"
                aria-label="Table"
              >
                <Button
                  variant="utility"
                  size="sm"
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                  + Row
                </Button>
                <Button
                  variant="utility"
                  size="sm"
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                  + Column
                </Button>
                <Button
                  variant="utility"
                  size="sm"
                  onClick={() => editor.chain().focus().deleteRow().run()}
                >
                  − Row
                </Button>
                <Button
                  variant="utility"
                  size="sm"
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                >
                  − Column
                </Button>
                <Button
                  variant="utility"
                  size="sm"
                  onClick={() => editor.chain().focus().deleteTable().run()}
                >
                  Delete table
                </Button>
              </span>
            )}
          </div>
          {linkBar !== null && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                applyLink();
              }}
              className="border-border flex gap-2 border-b p-2"
            >
              <input
                autoFocus
                value={linkBar}
                onChange={(e) => setLinkBar(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setLinkBar(null)}
                aria-label="Link address"
                placeholder="https://example.com (empty removes the link)"
                className="border-border bg-surface placeholder:text-muted-strong focus-visible:outline-ring min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2"
              />
              <Button type="submit" size="sm">
                Apply
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setLinkBar(null)}>
                Cancel
              </Button>
            </form>
          )}
          <EditorContent
            editor={editor}
            className="min-h-[50vh] px-4 py-3 text-base print:min-h-0"
          />
        </div>
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start print:hidden">
        <LinkedTasks noteId={note.id} initial={linkedTasks} />
      </aside>

      <VersionHistory
        noteId={note.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        beforeAction={flush}
        onRestored={(restored) => {
          setTitle(restored.title);
          editor?.commands.setContent(restored.content, { emitUpdate: false });
          router.refresh();
        }}
      />
    </div>
  );
}
