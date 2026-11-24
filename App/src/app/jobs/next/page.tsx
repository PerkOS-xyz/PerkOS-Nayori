import { redirect } from "next/navigation";

// The Nayori contracts are the default board now; keep the earlier preview link working.
export default function NextJobsPage() {
  redirect("/jobs");
}
