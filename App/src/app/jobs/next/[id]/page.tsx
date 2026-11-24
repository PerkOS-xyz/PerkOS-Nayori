import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NextJobDetailView from "../../../../components/nayori-next/NextJobDetailView";

export const metadata: Metadata = {
  title: "Nayori job",
};

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ asset?: string | string[] }>;
}

export default async function NextJobPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { asset } = await searchParams;
  const jobId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(jobId) || jobId < 1) notFound();
  return <NextJobDetailView id={jobId} asset={asset === "stx" ? "stx" : "sbtc"} />;
}
