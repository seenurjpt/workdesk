"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarRange,
  ChevronDown,
  ClipboardCheck,
  Columns3,
  FileText,
  GripVertical,
  HelpCircle,
  Hourglass,
  Inbox,
  LayoutTemplate,
  Plus,
  Settings,
  Sun,
  Tag,
  Trash2,
} from "lucide-react";
import { useApp } from "@/components/shared/user-context";
import { usePersistentBool } from "@/hooks/use-persistent-bool";
import { cn } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/types";
import { reorderProjectsAction } from "@/server/actions";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/tooltip";
import { GO_TARGETS } from "@/lib/shortcuts";
import { ProjectDialog } from "./project-dialog";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/today", label: "Today", icon: Sun },
  { href: "/board", label: "Board", icon: Columns3 },
  { href: "/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/waiting", label: "Waiting on", icon: Hourglass },
  { href: "/review", label: "Review", icon: ClipboardCheck },
] as const;

/**
 * A panel that slides open and closed. The height animates through a grid track (0fr to 1fr), so
 * no measuring is needed. While closed it is `inert`, which removes it from tab order and from
 * screen readers just as `hidden` did.
 */
function Collapse({
  id,
  open,
  children,
}: {
  id: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** The "G then letter" keys that open a page, for its tooltip. */
function goKeys(href: string): string[] | undefined {
  const letter = Object.entries(GO_TARGETS).find(([, target]) => target === href)?.[0];
  return letter ? ["G", letter.toUpperCase()] : undefined;
}

/** Labels fade instead of popping, so the sidebar can slide shut under them. */
const LABEL = "whitespace-nowrap transition-opacity duration-200 motion-reduce:transition-none";

export function NavLink({
  href,
  icon: Icon,
  children,
  collapsed,
  badge,
}: {
  href: string;
  icon: typeof Inbox;
  children: string;
  collapsed?: boolean;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Tooltip
      label={children}
      detail={badge ? `${badge} open` : undefined}
      keys={goKeys(href)}
      disabled={!collapsed}
    >
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-nav hover:bg-surface-soft relative flex items-center gap-3 overflow-hidden rounded-xl px-3.5 transition-[padding] duration-[320ms] motion-reduce:transition-none",
          collapsed ? "py-1.5" : "py-2",
          active && "bg-surface-soft",
        )}
      >
        {active && (
          <span className="bg-accent absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden />
        )}
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className={cn(LABEL, collapsed && "opacity-0")}>{children}</span>
        {badge ? (
          <span
            className={cn(
              "text-caption text-muted-strong ml-auto",
              LABEL,
              collapsed && "opacity-0",
            )}
          >
            {badge}
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}

function GeneralLink({ collapsed, count }: { collapsed: boolean; count: number }) {
  const pathname = usePathname();
  const active = pathname === "/general";
  return (
    <Tooltip
      label="General"
      detail={count > 0 ? `${count} open · no project` : "no project"}
      disabled={!collapsed}
    >
      <Link
        href="/general"
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-nav hover:bg-surface-soft relative mb-0.5 flex items-center gap-3 overflow-hidden rounded-xl px-3.5 transition-[padding] duration-[320ms] motion-reduce:transition-none",
          collapsed ? "py-1.5" : "py-2",
          active && "bg-surface-soft",
        )}
      >
        {active && (
          <span className="bg-accent absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden />
        )}
        <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
          <span className="border-muted-strong size-2.5 rounded-full border-2" />
        </span>
        <span className={cn(LABEL, collapsed && "opacity-0")}>General</span>
        {count > 0 && (
          <span
            className={cn(
              "text-caption text-muted-strong ml-auto",
              LABEL,
              collapsed && "opacity-0",
            )}
          >
            {count}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

function SortableProject({ project, collapsed }: { project: ProjectDTO; collapsed: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const pathname = usePathname();
  const active = pathname === `/projects/${project.id}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center",
        isDragging && "bg-surface shadow-float relative z-10 rounded-xl",
      )}
    >
      <Tooltip
        label={project.name}
        detail={project.openCount > 0 ? `${project.openCount} open` : "nothing open"}
        disabled={!collapsed}
      >
        <Link
          href={`/projects/${project.id}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "text-nav hover:bg-surface-soft relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-xl px-3.5 transition-[padding] duration-[320ms] motion-reduce:transition-none",
            collapsed ? "py-1.5" : "py-2",
            active && "bg-surface-soft",
          )}
        >
          {active && (
            <span className="bg-accent absolute inset-y-1.5 left-0 w-1 rounded-full" aria-hidden />
          )}
          <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />
          </span>
          <span className={cn(LABEL, "truncate", collapsed && "opacity-0")}>{project.name}</span>
          {project.openCount > 0 && (
            <span
              className={cn(
                "text-caption text-muted-strong ml-auto",
                LABEL,
                collapsed && "opacity-0",
              )}
            >
              {project.openCount}
            </span>
          )}
        </Link>
      </Tooltip>
      {!collapsed && (
        <button
          type="button"
          aria-label={`Reorder ${project.name}`}
          className="text-muted-strong ml-1 inline-flex size-8 cursor-grab touch-none items-center justify-center rounded-lg opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}

/** A section heading that folds its content away. Shows how many items it holds when closed. */
function SectionToggle({
  id,
  panelId,
  label,
  count,
  open,
  onToggle,
  rail = false,
}: {
  id: string;
  panelId: string;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  rail?: boolean;
}) {
  if (rail) {
    return (
      <h2 id={id} className="sr-only">
        {label}
      </h2>
    );
  }
  return (
    <h2 id={id} className="min-w-0 flex-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="text-caption text-muted-strong hover:bg-surface-soft flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left font-semibold"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform motion-reduce:transition-none",
            !open && "-rotate-90",
          )}
          aria-hidden
        />
        {label}
        {!open && <span className="ml-auto font-normal">{count}</span>}
      </button>
    </h2>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { projects, tags, generalCount } = useApp();
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);
  const [projectsClosed, setProjectsClosed] = usePersistentBool("workdesk:sidebar-projects-closed");
  const [tagsClosed, setTagsClosed] = usePersistentBool("workdesk:sidebar-tags-closed");
  // the icon-only rail has no section headers, so it always shows everything
  const projectsOpen = collapsed || !projectsClosed;
  const tagsOpen = collapsed || !tagsClosed;
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = localOrder
    ? localOrder
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is ProjectDTO => Boolean(p))
    : projects;

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((p) => p.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setLocalOrder(next);
    const res = await reorderProjectsAction(next);
    if (!res.ok) toast.error(res.error);
    router.refresh();
    setLocalOrder(null);
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex min-h-0 flex-1 scroll-py-3 flex-col overflow-x-hidden overflow-y-auto px-3 transition-[padding,gap] duration-[320ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none",
        // The icon-only rail is denser so the whole menu fits without scrolling.
        // Expanded: always keep room for the scrollbar, so rows do not change width when it appears.
        // (The 72px icon rail has no room to spare, so it does not reserve it.)
        collapsed ? "gap-3 py-2" : "[scrollbar-gutter:stable] gap-6 py-3",
      )}
    >
      <ul className={cn(collapsed ? "space-y-0.5" : "space-y-1")}>
        {NAV.map(({ href, label, icon }) => (
          <li key={href}>
            <NavLink href={href} icon={icon} collapsed={collapsed}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      {/* Projects and Tags sit close together while Projects is folded, and apart when it is open. */}
      <div
        className={cn(
          "flex flex-col transition-[gap] duration-200 motion-reduce:transition-none",
          projectsOpen && !collapsed ? "gap-6" : "gap-1",
        )}
      >
        <section
          aria-labelledby="projects-heading"
          className={cn(collapsed && "border-border border-t pt-3")}
        >
          <div className={cn("mb-1 flex items-center", collapsed ? "pl-2" : "gap-1")}>
            <SectionToggle
              id="projects-heading"
              panelId="projects-panel"
              label="Projects"
              count={projects.length + 1}
              open={projectsOpen}
              onToggle={() => setProjectsClosed(projectsOpen)}
              rail={collapsed}
            />
            <Tooltip label="New project" side={collapsed ? "right" : "top"}>
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                aria-label="New project"
                className="text-muted-strong hover:bg-surface-soft inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </Tooltip>
          </div>
          <Collapse id="projects-panel" open={projectsOpen}>
            <GeneralLink collapsed={collapsed} count={generalCount} />
            <DndContext
              id="project-sort"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={items.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-0.5">
                  {items.map((p) => (
                    <SortableProject key={p.id} project={p} collapsed={collapsed} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {projects.length === 0 && !collapsed && (
              <p className="text-caption text-muted-strong px-3">No projects yet.</p>
            )}
          </Collapse>
        </section>

        {tags.length > 0 && !collapsed && (
          <section aria-labelledby="tags-heading">
            <div className="mb-1 flex items-center gap-1">
              <SectionToggle
                id="tags-heading"
                panelId="tags-panel"
                label="Tags"
                count={tags.length}
                open={tagsOpen}
                onToggle={() => setTagsClosed(tagsOpen)}
              />
              {/* Same width as the + button on the Projects row, so the counts line up. */}
              <span className="size-8 shrink-0" aria-hidden />
            </div>
            <Collapse id="tags-panel" open={tagsOpen}>
              <ul className="space-y-0.5">
                {tags.slice(0, 12).map(({ tag, count }) => (
                  <li key={tag}>
                    <NavLink href={`/tags/${encodeURIComponent(tag)}`} icon={Tag} badge={count}>
                      {tag}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </Collapse>
          </section>
        )}
      </div>

      <ul
        className={cn(
          "mt-auto",
          collapsed ? "border-border space-y-0.5 border-t pt-3" : "space-y-1",
        )}
      >
        <li>
          <NavLink href="/templates" icon={LayoutTemplate} collapsed={collapsed}>
            Templates
          </NavLink>
        </li>
        <li>
          <NavLink href="/trash" icon={Trash2} collapsed={collapsed}>
            Trash
          </NavLink>
        </li>
        <li>
          <NavLink href="/settings" icon={Settings} collapsed={collapsed}>
            Settings
          </NavLink>
        </li>
        <li>
          <NavLink href="/help" icon={HelpCircle} collapsed={collapsed}>
            Help
          </NavLink>
        </li>
      </ul>

      <ProjectDialog open={newOpen} onOpenChange={setNewOpen} />
    </nav>
  );
}
