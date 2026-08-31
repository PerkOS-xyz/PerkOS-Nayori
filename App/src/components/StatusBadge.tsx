const STATUS_CONFIG: Record<number, { label: string; dot: string; cls: string }> = {
  0: { label: "Open", dot: "bg-mist-500", cls: "border-white/10 text-mist-300" },
  1: { label: "Funded", dot: "bg-bitcoin", cls: "border-bitcoin/30 text-bitcoin-400" },
  2: { label: "Submitted", dot: "bg-brand-400", cls: "border-brand/30 text-brand-300" },
  3: { label: "Completed", dot: "bg-emerald-400", cls: "border-emerald-500/30 text-emerald-300" },
  4: { label: "Rejected", dot: "bg-red-400", cls: "border-red-500/30 text-red-300" },
  5: { label: "Expired", dot: "bg-mist-500", cls: "border-white/10 text-mist-500" },
  6: { label: "Timeout paid", dot: "bg-amber-400", cls: "border-amber-500/30 text-amber-300" },
  7: { label: "Decision pending", dot: "bg-violet-400", cls: "border-violet-500/30 text-violet-300" },
  8: { label: "Disputed", dot: "bg-fuchsia-400", cls: "border-fuchsia-500/30 text-fuchsia-300" },
};

export default function StatusBadge({ status }: { status: number }) {
  const c = STATUS_CONFIG[status] ?? { label: "Unknown", dot: "bg-mist-500", cls: "border-white/10 text-mist-300" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
