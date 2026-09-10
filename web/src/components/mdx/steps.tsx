"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StepsProps {
  children: ReactNode;
  className?: string;
}

export function Steps({ children, className }: StepsProps) {
  return (
    <div
      className={cn(
        "relative my-6 ml-3 border-l-2 border-border pl-6 [counter-reset:step]",
        className
      )}
    >
      {children}
    </div>
  );
}

interface StepProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Step({ title, children, className }: StepProps) {
  return (
    <div
      className={cn(
        "relative pb-6 last:pb-0",
        "[counter-increment:step]",
        "before:absolute before:-left-[31px] before:flex before:h-7 before:w-7 before:items-center before:justify-center",
        "before:rounded-full before:border-2 before:border-primary before:bg-background before:text-xs before:font-semibold before:text-primary",
        "before:content-[counter(step)]",
        className
      )}
    >
      {title && (
        <h4 className="mb-2 font-semibold text-foreground">{title}</h4>
      )}
      <div className="text-muted-foreground prose-sm">{children}</div>
    </div>
  );
}
