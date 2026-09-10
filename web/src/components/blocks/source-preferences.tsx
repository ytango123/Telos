"use client";

import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export const PRESET_SOURCES = [
  { id: "arxiv", label: "arXiv (学术论文)" },
  { id: "github", label: "GitHub" },
  { id: "stackoverflow", label: "Stack Overflow" },
  { id: "mdn", label: "MDN (前端文档)" },
  { id: "csdn", label: "CSDN" },
];

const PRESET_IDS = new Set(PRESET_SOURCES.map((s) => s.id));

interface SourcePreferencesProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function SourcePreferences({ value, onChange, disabled }: SourcePreferencesProps) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState("");

  const customSources = value.filter((s) => !PRESET_IDS.has(s));

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((s) => s !== id) : [...value, id]);
  };

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setCustom("");
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {PRESET_SOURCES.map((source) => (
          <Badge
            key={source.id}
            variant={value.includes(source.id) ? "default" : "outline"}
            className={`cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}
            onClick={() => toggle(source.id)}
          >
            {source.label}
          </Badge>
        ))}

        {customSources.map((s) => (
          <Badge key={s} variant="default" className="gap-1">
            {s}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== s))}
                className="ml-0.5 opacity-80 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}

        {!disabled && !adding && (
          <Badge
            variant="outline"
            className="cursor-pointer gap-1 border-dashed text-muted-foreground"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3" />
            自定义
          </Badge>
        )}
      </div>

      {adding && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder="名称或域名"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              } else if (e.key === "Escape") {
                setAdding(false);
                setCustom("");
              }
            }}
            className="h-8 max-w-xs text-sm"
          />
          <button
            type="button"
            onClick={addCustom}
            className="text-muted-foreground hover:text-primary"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setCustom("");
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
