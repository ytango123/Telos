"use client";

import { useRef, useState } from "react";
import type { DragEvent, ClipboardEvent, KeyboardEvent, ChangeEvent } from "react";
import {
  Upload,
  Type,
  Link as LinkIcon,
  Globe,
  Film,
  Plus,
  FileText,
  FileUp,
  X,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ types */

export interface FileItem {
  key: string;
  name: string;
  size?: number;
  /** 0..100 — undefined / 100 means done */
  progress?: number;
  error?: string;
}
export interface TextItem {
  key: string;
  preview: string;
  chars: number;
}
export interface LinkItem {
  key: string;
  url: string;
  kind: "link" | "video";
}

interface MaterialPickerProps {
  items: {
    files: FileItem[];
    texts: TextItem[];
    links: LinkItem[];
  };
  onAddFile: (file: File) => void;
  onAddText: (text: string) => void;
  onAddLink: (url: string, kind: "link" | "video") => void;
  onRemove: (
    kind: "file" | "text" | "link" | "video",
    key: string
  ) => void;
  /** Retry handler for failed file uploads (edit mode only). */
  onRetryFile?: (key: string) => void;
  disabled?: boolean;
}

type Tab = "file" | "text" | "link";

const FILE_ACCEPT = ".pdf,.txt,.md,.doc,.docx,.png,.jpg,.jpeg";

const TABS: { id: Tab; label: string; icon: typeof Upload }[] = [
  { id: "file", label: "文件", icon: Upload },
  { id: "text", label: "文本", icon: Type },
  { id: "link", label: "链接", icon: LinkIcon },
];

/* ------------------------------------------------------------------ root */

export function MaterialPicker({
  items,
  onAddFile,
  onAddText,
  onAddLink,
  onRemove,
  onRetryFile,
  disabled,
}: MaterialPickerProps) {
  const [tab, setTab] = useState<Tab>("file");
  const tabIdx = TABS.findIndex((t) => t.id === tab);

  return (
    <div
      className={cn(
        "flex min-h-[360px] flex-col gap-5",
        disabled && "pointer-events-none opacity-60"
      )}
    >
      {/* Segmented control */}
      <div
        role="tablist"
        aria-label="资料类型"
        className="relative grid shrink-0 grid-cols-3 rounded-xl border border-border/50 bg-muted/30 p-1"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-card shadow-[var(--shadow-soft-1)] ring-1 ring-border/50 transition-transform duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            transform: `translateX(calc(${tabIdx} * 100%))`,
          }}
        />
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "motion-spring relative z-[1] flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "file" && (
          <FilePanel
            items={items.files}
            onAddFile={onAddFile}
            onRemove={(k) => onRemove("file", k)}
            onRetry={onRetryFile}
          />
        )}
        {tab === "text" && (
          <TextPanel
            items={items.texts}
            onAddText={onAddText}
            onRemove={(k) => onRemove("text", k)}
          />
        )}
        {tab === "link" && (
          <LinkPanel
            items={items.links}
            onAddLink={onAddLink}
            onRemove={(kind, k) => onRemove(kind, k)}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ FILE */

function FilePanel({
  items,
  onAddFile,
  onRemove,
  onRetry,
}: {
  items: FileItem[];
  onAddFile: (f: File) => void;
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types?.includes("Files")) setDrag(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDrag(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDrag(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    files.forEach((f) => onAddFile(f));
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((f) => onAddFile(f));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "motion-spring relative flex shrink-0 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-8 text-center outline-none",
          "border-[color-mix(in_oklab,var(--accent-sky)_28%,var(--border))]",
          "bg-[color-mix(in_oklab,var(--accent-sky)_7%,white)]",
          "hover:bg-[color-mix(in_oklab,var(--accent-sky)_11%,white)]",
          "focus-visible:ring-2 focus-visible:ring-[var(--accent-sky)]/25",
          drag &&
            "scale-[1.005] border-dashed border-[var(--accent-sky)]/70 bg-[color-mix(in_oklab,var(--accent-sky)_14%,white)]"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={FILE_ACCEPT}
          hidden
          onChange={onPick}
        />
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[var(--accent-sky)] ring-1 ring-[var(--accent-sky)]/20 shadow-[var(--shadow-soft-1)]"
        >
          {drag ? (
            <FileUp className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <Upload className="h-5 w-5" strokeWidth={1.75} />
          )}
        </span>

        <div className="space-y-1">
          <p className="text-sm tracking-tight text-foreground">
            {drag ? (
              <span className="text-[var(--accent-sky)]">松手添加</span>
            ) : (
              <>
                拖入文件，或
                <span className="ml-1 font-medium text-[var(--accent-sky)]">
                  浏览本地
                </span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">PDF · 文档 · 图片</p>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {items.map((it) => (
            <FileRow
              key={it.key}
              item={it}
              onRemove={() => onRemove(it.key)}
              onRetry={onRetry ? () => onRetry(it.key) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  item,
  onRemove,
  onRetry,
}: {
  item: FileItem;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  const uploading = typeof item.progress === "number" && item.progress < 100;
  const failed = !!item.error;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3",
        failed && "border-[var(--accent-rose)]/35"
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-border/50",
          failed
            ? "bg-[color-mix(in_oklab,var(--accent-rose)_8%,white)] text-[var(--accent-rose)]"
            : "bg-muted/40 text-[var(--accent-sky)]"
        )}
      >
        {failed ? (
          <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <FileText className="h-4 w-4" strokeWidth={1.5} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">{item.name}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {failed ? (
            <span className="text-[var(--accent-rose)]">{item.error}</span>
          ) : (
            <>
              {typeof item.size === "number" && (
                <span className="font-mono">{formatBytes(item.size)}</span>
              )}
              {uploading && (
                <span className="font-mono">{item.progress!.toFixed(0)}%</span>
              )}
            </>
          )}
        </div>
        {uploading && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--accent-sky)] transition-[width] duration-300 ease-out"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        {failed && onRetry && (
          <RowIcon onClick={onRetry} title="重试">
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </RowIcon>
        )}
        {uploading ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-muted-foreground"
            strokeWidth={1.75}
          />
        ) : (
          <RowIcon onClick={onRemove} title="移除" variant="danger">
            <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          </RowIcon>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ TEXT */

function TextPanel({
  items,
  onAddText,
  onRemove,
}: {
  items: TextItem[];
  onAddText: (text: string) => void;
  onRemove: (key: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onAddText(v);
    setText("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-xl border border-border/50 bg-card p-4">
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="粘贴或输入文字…"
          className="resize-none border-0 bg-transparent p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="mt-3 flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!text.trim()}
            className="motion-spring press-tactile h-8 gap-1.5 px-3.5"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            添加
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {items.map((it) => (
            <TextRow key={it.key} item={it} onRemove={() => onRemove(it.key)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TextRow({
  item,
  onRemove,
}: {
  item: TextItem;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground ring-1 ring-border/50">
        <Type className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium tracking-tight">{item.preview}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{item.chars} 字</p>
      </div>
      <RowIcon onClick={onRemove} title="移除" variant="danger">
        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
      </RowIcon>
    </li>
  );
}

/* ------------------------------------------------------------------ LINK */

function LinkPanel({
  items,
  onAddLink,
  onRemove,
}: {
  items: LinkItem[];
  onAddLink: (url: string, kind: "link" | "video") => void;
  onRemove: (kind: "link" | "video", key: string) => void;
}) {
  const webLinks = items.filter((it) => it.kind === "link");
  const videoLinks = items.filter((it) => it.kind === "video");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <LinkInputBox
        icon={<Globe className="h-4 w-4" strokeWidth={1.75} />}
        title="网页链接"
        placeholder="粘贴链接后按 Enter"
        items={webLinks}
        onAdd={(url) => onAddLink(url, "link")}
        onRemove={(key) => onRemove("link", key)}
      />
      <LinkInputBox
        icon={<Film className="h-4 w-4" strokeWidth={1.75} />}
        title="视频链接"
        placeholder="粘贴链接后按 Enter"
        items={videoLinks}
        onAdd={(url) => onAddLink(url, "video")}
        onRemove={(key) => onRemove("video", key)}
      />
    </div>
  );
}

function LinkInputBox({
  icon,
  title,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  placeholder: string;
  items: LinkItem[];
  onAdd: (url: string) => void;
  onRemove: (key: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string): boolean => {
    const url = raw.trim();
    if (!url) return false;
    if (!/^https?:\/\/\S+/i.test(url)) {
      setError("请粘贴完整 URL");
      return false;
    }
    onAdd(url);
    setValue("");
    setError("");
    return true;
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (pasted && /^https?:\/\/\S+/i.test(pasted.trim())) {
      e.preventDefault();
      commit(pasted);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(value);
    }
    // Backspace on empty input removes last chip
    if (e.key === "Backspace" && !value && items.length > 0) {
      onRemove(items[items.length - 1].key);
    }
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className={cn(
        "flex-1 cursor-text rounded-xl border border-border/50 bg-card px-4 py-3",
        "hover:border-foreground/15",
        "focus-within:border-foreground/20 focus-within:shadow-[var(--shadow-soft-1)]"
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40 text-foreground/70 ring-1 ring-border/50">
          {icon}
        </span>
        <p className="text-[13px] font-medium tracking-tight text-foreground/80">{title}</p>
      </div>

      {/* Chips + Input inline */}
      <div className="flex min-h-[36px] flex-wrap items-center gap-2">
        {items.map((it) => (
          <LinkChipInline key={it.key} item={it} onRemove={() => onRemove(it.key)} />
        ))}
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={items.length === 0 ? placeholder : ""}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          className="min-w-[120px] flex-1 border-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
        />
      </div>
      {error && (
        <p className="mt-2 text-xs text-[var(--accent-rose)]">{error}</p>
      )}
    </div>
  );
}

function LinkChipInline({
  item,
  onRemove,
}: {
  item: LinkItem;
  onRemove: () => void;
}) {
  const host = (() => {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      return item.url;
    }
  })();
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 py-1 pl-1.5 pr-1 text-sm"
      title={item.url}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={favicon}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      </span>
      <span className="max-w-[14ch] truncate text-[13px] text-foreground/90">{host}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-[var(--accent-rose)]"
        aria-label="移除"
      >
        <X className="h-3 w-3" strokeWidth={1.75} />
      </button>
    </span>
  );
}

/* ------------------------------------------------------------------ utils */

function RowIcon({
  children,
  onClick,
  title,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted",
        variant === "danger" ? "hover:text-[var(--accent-rose)]" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
