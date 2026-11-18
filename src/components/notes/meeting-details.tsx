"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { parseLocalInput, toDateInput } from "@/lib/format";
import type { NoteDTO } from "@/lib/types";

type Meeting = NonNullable<NoteDTO["meeting"]>;

/** Date, attendees and agenda for a meeting note. Saved through the note's autosave. */
export function MeetingDetails({
  initial,
  timezone,
  onChange,
}: {
  initial: Meeting | null;
  timezone: string;
  onChange: (meeting: { date: Date | null; attendees: string[]; agenda: string }) => void;
}) {
  const [date, setDate] = useState(toDateInput(initial?.date ?? null, timezone));
  const [attendees, setAttendees] = useState((initial?.attendees ?? []).join(", "));
  const [agenda, setAgenda] = useState(initial?.agenda ?? "");

  function emit(next: { date?: string; attendees?: string; agenda?: string }) {
    const d = next.date ?? date;
    const a = next.attendees ?? attendees;
    const g = next.agenda ?? agenda;
    onChange({
      date: d ? parseLocalInput(d, "09:00", timezone) : null,
      attendees: a
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 30),
      agenda: g,
    });
  }

  return (
    <section aria-labelledby="meeting-heading" className="bg-band my-4 rounded-3xl p-4">
      <h2 id="meeting-heading" className="text-nav mb-3 flex items-center gap-2">
        <CalendarClock className="size-4" aria-hidden /> Meeting details
      </h2>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div>
          <Label htmlFor="meeting-date">Date</Label>
          <Input
            id="meeting-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              emit({ date: e.target.value });
            }}
          />
        </div>
        <div>
          <Label htmlFor="meeting-attendees">Attendees (comma separated)</Label>
          <Input
            id="meeting-attendees"
            placeholder="Rahul, Priya, Meera"
            value={attendees}
            onChange={(e) => {
              setAttendees(e.target.value);
              emit({ attendees: e.target.value });
            }}
          />
        </div>
      </div>
      <div className="mt-3">
        <Label htmlFor="meeting-agenda">Agenda</Label>
        <Textarea
          id="meeting-agenda"
          rows={2}
          maxLength={1000}
          placeholder="What is this meeting for?"
          value={agenda}
          onChange={(e) => {
            setAgenda(e.target.value);
            emit({ agenda: e.target.value });
          }}
        />
      </div>
    </section>
  );
}
