import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NextJobDetailView from "../../../../components/nayori-next/NextJobDetailView";
import { NAYORI_NEXT_ENABLED } from "../../../../constants/nayori-next";

export const metadata: Metadata = {
  title: "Job on the next contracts",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asset?: string | string[] }>;
}

export default async function NextJobPage({ params, searchParams }: Props) {
  if (!NAYORI_NEXT_ENABLED) notFound();
  const { id } = await params;
  const { asset } = await searchParams;
  const jobId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(jobId) || jobId < 1) notFound();
  return <NextJobDetailView id={jobId} asset={asset === "stx" ? "stx" : "sbtc"} />;
}
