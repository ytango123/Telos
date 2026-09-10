"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface HighlightProps {
  children: ReactNode;
  type?: "yellow" | "green" | "blue" | "pink" | "purple";
  className?: string;
}

const highlightColors = {
  yellow: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-100",
  green: "bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100",
  blue: "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100",
  pink: "bg-pink-100 dark:bg-pink-900/40 text-pink-900 dark:text-pink-100",
  purple: "bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100",
};

export function Highlight({ children, type = "yellow", className }: HighlightProps) {
  return (
    <mark
      className={cn(
        "rounded px-1 py-0.5 font-medium",
        highlightColors[type],
        className
      )}
    >
      {children}
    </mark>
  );
}

interface KeyPointProps {
  children: ReactNode;
  className?: string;
}

export function KeyPoint({ children, className }: KeyPointProps) {
  return (
    <div
      className={cn(
        "my-6 rounded-xl border-l-4 border-primary bg-primary/5 p-4 pl-6",
        className
      )}
    >
      <div className="font-semibold text-primary mb-1">重点</div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

interface SummaryBoxProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function SummaryBox({ title = "本节小结", children, className }: SummaryBoxProps) {
  return (
    <div
      className={cn(
        "my-8 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/30 p-6",
        className
      )}
    >
      <h4 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          ✓
        </span>
        {title}
      </h4>
      <div className="text-sm text-muted-foreground prose-sm prose-ul:my-2 prose-li:my-0.5">
        {children}
      </div>
    </div>
  );
}
