"use client";

import { useRef, useState } from "react";
import { buttonClass, cx } from "../ui";
import { writeTableClipboard } from "./table-clipboard";

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CopyTableButton({ matrix }: { matrix: string[][] }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | null>(null);
  const copied = copyState === "copied";

  async function copyTable() {
    try {
      await writeTableClipboard(matrix);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopyState("idle"), 2000);
  }

  return (
    <div className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        className={cx(buttonClass("secondary", "sm"), "px-2")}
        aria-label={copied ? "Tableau copié" : "Copier le tableau"}
        title={copied ? "Copié" : "Copier le tableau"}
        onClick={() => void copyTable()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <p className="sr-only" role="status">
        {copied ? "Tableau copié dans le presse-papiers." : copyState === "error" ? "Impossible de copier le tableau." : ""}
      </p>
      {copyState === "error" && <p className="mt-1 text-xs text-red-700">Impossible de copier le tableau.</p>}
    </div>
  );
}
