import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NextJobsBoard from "../../../components/nayori-next/NextJobsBoard";
import { NAYORI_NEXT_ENABLED } from "../../../constants/nayori-next";

export const metadata: Metadata = {
  title: "Jobs on the next contracts",
  robots: { index: false, follow: false },
};

// Off by default: without NEXT_PUBLIC_NAYORI_NEXT_DEPLOYER this route does not exist.
export default function NextJobsPage() {
  if (!NAYORI_NEXT_ENABLED) notFound();
  return <NextJobsBoard />;
}
