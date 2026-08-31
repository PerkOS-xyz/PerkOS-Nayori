import { Check, Clock3, X } from "lucide-react";

const STEPS = ["Open", "Funded", "Submitted", "Decision", "Completed"];

// Visual lifecycle for a job: Open -> Funded -> Submitted -> Completed,
// with the autonomous decision/appeal states and terminal alternatives.
export default function JobStepper({ status }: { status: number }) {
  const rejected = status === 4;
  const expired = status === 5;
  const timedOut = status === 6;
  const decisionPending = status === 7;
  const disputed = status === 8;
  const isDone = status === 3;
  const reached = isDone
    ? 4
    : decisionPending || disputed
      ? 3
      : rejected
        ? 4
        : timedOut
          ? 2
          : expired
            ? 0
            : Math.min(status, 2);

  return (
    <div className="mt-4 flex items-center">
      {STEPS.map((label, i) => {
        const last = i === STEPS.length - 1;
        const terminalHere = last && (rejected || expired || timedOut);
        const done = !terminalHere && (i < reached || isDone);
        const current = !terminalHere && i === reached && !isDone;

        let ring = "border-white/[0.12] text-mist-500";
        if (done) ring = "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
        else if (current) ring = disputed
          ? "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300"
          : decisionPending
            ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
            : "border-brand/40 bg-brand/10 text-brand-300";
        if (terminalHere && rejected) ring = "border-red-500/40 bg-red-500/10 text-red-300";
        if (terminalHere && expired) ring = "border-white/15 bg-white/[0.04] text-mist-400";
        if (terminalHere && timedOut) ring = "border-amber-500/40 bg-amber-500/10 text-amber-300";

        const text = terminalHere
          ? rejected
            ? "Rejected"
            : expired
              ? "Expired"
              : "Timeout paid"
          : i === 3 && disputed
            ? "Disputed"
            : i === 3 && decisionPending
              ? "Appeal open"
              : label;
        const lit = done || current || terminalHere;

        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${ring}`}>
                {done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : terminalHere && rejected ? (
                  <X className="h-3.5 w-3.5" />
                ) : terminalHere && timedOut ? (
                  <Clock3 className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-[10px] ${lit ? "text-mist-300" : "text-mist-500"}`}>{text}</span>
            </div>
            {!last && <div className={`mx-1.5 h-px w-8 sm:w-12 ${i < reached || isDone ? "bg-emerald-500/30" : "bg-white/[0.08]"}`} />}
          </div>
        );
      })}
    </div>
  );
}
