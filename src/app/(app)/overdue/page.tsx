import { redirect } from "next/navigation";

// Upcoming and Overdue are tabs of the Today page now. This keeps old links and bookmarks working.
export default function Page() {
  redirect("/today?tab=overdue");
}
