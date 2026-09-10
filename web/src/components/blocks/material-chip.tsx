"use client";

import { X } from "lucide-react";

interface MaterialChipProps {
  icon: React.ReactNode;
  label: string;
  meta?: string;
  href?: string;
  onRemove?: () => void;
}

export function MaterialChip({ icon, label, meta, href, onRemove }: MaterialChipProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex-1 truncate text-sm text-primary hover:underline"
        >
          {label}
        </a>
      ) : (
        <span className="flex-1 truncate text-sm">{label}</span>
      )}
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
