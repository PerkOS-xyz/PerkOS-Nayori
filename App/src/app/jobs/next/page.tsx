import type { Metadata } from "next";
import NextJobsBoard from "../../../components/nayori-next/NextJobsBoard";

export const metadata: Metadata = {
  title: "Jobs on the next contracts",
  robots: { index: false, follow: false },
};

export default function NextJobsPage() {
  return <NextJobsBoard />;
}
