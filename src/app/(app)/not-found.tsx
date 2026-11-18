import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-24 text-center">
      <h1 className="text-page-title">Not found</h1>
      <p className="text-muted-strong mt-3 mb-6 text-lg font-light">
        That page does not exist or was removed.
      </p>
      <Button asChild>
        <Link href="/today">Back to Today</Link>
      </Button>
    </div>
  );
}
