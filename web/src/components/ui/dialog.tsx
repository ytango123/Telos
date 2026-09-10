"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Telos Dialog — a single, well-behaved modal primitive.
 *
 * - Renders to <body> via portal (immune to ancestor overflow/transform).
 * - Mount/unmount is animated via data-state attributes so we get clean exit motion.
 * - Doesn't toggle body overflow (prevents the page from shifting when scrollbars vanish).
 * - Esc + backdrop click both dismiss.
 * - First focusable element receives focus on open; previous focus restored on close.
 */

interface DialogContextValue {
  open: boolean;
  close: () => void;
}
const DialogContext = createContext<DialogContextValue | null>(null);

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Handle open/close transitions
  useEffect(() => {
    if (open) {
      previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
      setVisible(true);
      setAnimating(false);
    } else if (visible) {
      setAnimating(true);
      const t = window.setTimeout(() => {
        setVisible(false);
        setAnimating(false);
        previouslyFocused.current?.focus?.();
      }, 200);
      return () => window.clearTimeout(t);
    }
  }, [open, visible]);

  // Esc to close
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onOpenChange]);

  // Focus the first focusable element when opened
  useEffect(() => {
    if (!open || !visible || animating) return;
    const root = containerRef.current;
    if (!root) return;
    const first = root.querySelector<HTMLElement>(
      "[data-autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled])"
    );
    first?.focus({ preventScroll: true });
  }, [open, visible, animating]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (!mounted || !visible) return null;

  const dataState = animating ? "closed" : "open";

  return createPortal(
    <DialogContext.Provider value={{ open: open && !animating, close }}>
      <div
        ref={containerRef}
        className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-6 sm:p-8"
        role="dialog"
        aria-modal="true"
      >
        <div
          data-state={dataState}
          className="telos-overlay absolute inset-0 bg-black/35 backdrop-blur-md"
          onClick={close}
          aria-hidden
        />
        <div
          data-state={dataState}
          className="telos-dialog relative z-[1] w-full origin-center"
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>,
    document.body
  );
}

/**
 * The visible card surface. Separate from <Dialog> so callers can compose
 * width / radius / etc.
 */
export function DialogSurface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground",
        "shadow-[var(--shadow-soft-4)]",
        "ring-1 ring-black/[0.02]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DialogHeader({
  title,
  description,
  showClose = true,
}: {
  title: string;
  description?: string;
  showClose?: boolean;
}) {
  const ctx = useContext(DialogContext);
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border/50 px-8 py-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {showClose && (
        <button
          type="button"
          aria-label="关闭"
          onClick={() => ctx?.close()}
          className="-mr-1 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </header>
  );
}

export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("max-h-[min(82dvh,820px)] overflow-y-auto", className)}>
      {children}
    </div>
  );
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 border-t border-border/50 bg-muted/20 px-8 py-4",
        className
      )}
    >
      {children}
    </div>
  );
}
