import { permanentRedirect } from "next/navigation";

// The dashboard read only the earlier contracts. The stats page covers both contract sets, with
// agents counted once per wallet, so existing links land there.
export default function DashboardPage() {
  permanentRedirect("/stats");
}
