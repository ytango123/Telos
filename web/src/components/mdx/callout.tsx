"use client";

import { CircleCheck, CircleX, Info, Lightbulb, TriangleAlert, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type CalloutType = "info" | "warn" | "warning" | "error" | "success" | "idea" | "tip" | "note" | "important";

const typeConfig = {
  info: {
    icon: Info,
    bgClass: "bg-blue-50 dark:bg-blue-950/40",
    borderClass: "border-l-4 border-blue-500",
    iconClass: "text-blue-500",
    titleClass: "text-blue-800 dark:text-blue-200",
  },
  note: {
    icon: Info,
    bgClass: "bg-slate-50 dark:bg-slate-900/40",
    borderClass: "border-l-4 border-slate-400",
    iconClass: "text-slate-500",
    titleClass: "text-slate-800 dark:text-slate-200",
  },
  tip: {
    icon: Lightbulb,
    bgClass: "bg-emerald-50 dark:bg-emerald-950/40",
    borderClass: "border-l-4 border-emerald-500",
    iconClass: "text-emerald-500",
    titleClass: "text-emerald-800 dark:text-emerald-200",
  },
  idea: {
    icon: Lightbulb,
    bgClass: "bg-amber-50 dark:bg-amber-950/40",
    borderClass: "border-l-4 border-amber-500",
    iconClass: "text-amber-500",
    titleClass: "text-amber-800 dark:text-amber-200",
  },
  important: {
    icon: Star,
    bgClass: "bg-purple-50 dark:bg-purple-950/40",
    borderClass: "border-l-4 border-purple-500",
    iconClass: "text-purple-500",
    titleClass: "text-purple-800 dark:text-purple-200",
  },
  warning: {
    icon: TriangleAlert,
    bgClass: "bg-yellow-50 dark:bg-yellow-950/40",
    borderClass: "border-l-4 border-yellow-500",
    iconClass: "text-yellow-600",
    titleClass: "text-yellow-800 dark:text-yellow-200",
  },
  warn: {
    icon: TriangleAlert,
    bgClass: "bg-yellow-50 dark:bg-yellow-950/40",
    borderClass: "border-l-4 border-yellow-500",
    iconClass: "text-yellow-600",
    titleClass: "text-yellow-800 dark:text-yellow-200",
  },
  error: {
    icon: CircleX,
    bgClass: "bg-red-50 dark:bg-red-950/40",
    borderClass: "border-l-4 border-red-500",
    iconClass: "text-red-500",
    titleClass: "text-red-800 dark:text-red-200",
  },
  success: {
    icon: CircleCheck,
    bgClass: "bg-green-50 dark:bg-green-950/40",
    borderClass: "border-l-4 border-green-500",
    iconClass: "text-green-500",
    titleClass: "text-green-800 dark:text-green-200",
  },
};

interface CalloutProps {
  type?: CalloutType;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

const defaultTitles: Record<CalloutType, string> = {
  info: "提示",
  note: "注意",
  tip: "技巧",
  idea: "想法",
  important: "重要",
  warning: "警告",
  warn: "警告",
  error: "错误",
  success: "成功",
};

export function Callout({ type = "info", title, children, className }: CalloutProps) {
  const config = typeConfig[type] || typeConfig.info;
  const Icon = config.icon;
  const displayTitle = title || defaultTitles[type];

  return (
    <div
      className={cn(
        "my-6 flex gap-3 rounded-lg p-4 not-prose",
        config.bgClass,
        config.borderClass,
        className
      )}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 flex-shrink-0", config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold mb-1.5 text-sm", config.titleClass)}>
          {displayTitle}
        </p>
        <div className="text-sm text-muted-foreground leading-relaxed [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
          {children}
        </div>
      </div>
    </div>
  );
}
