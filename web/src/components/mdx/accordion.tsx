"use client";

import { ChevronDown } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AccordionContextValue {
  openItems: Set<string>;
  toggle: (value: string) => void;
  type: "single" | "multiple";
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext() {
  const context = useContext(AccordionContext);
  if (!context) {
    throw new Error("Accordion components must be used within an Accordion");
  }
  return context;
}

interface AccordionProps {
  type?: "single" | "multiple";
  defaultValue?: string | string[];
  children: ReactNode;
  className?: string;
}

export function Accordion({
  type = "single",
  defaultValue,
  children,
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(() => {
    if (!defaultValue) return new Set();
    return new Set(Array.isArray(defaultValue) ? defaultValue : [defaultValue]);
  });

  const toggle = (value: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        if (type === "single") {
          next.clear();
        }
        next.add(value);
      }
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle, type }}>
      <div
        className={cn(
          "my-6 divide-y divide-border overflow-hidden rounded-xl border",
          className
        )}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  value: string;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AccordionItem({ value, title, children, className }: AccordionItemProps) {
  const { openItems, toggle } = useAccordionContext();
  const isOpen = openItems.has(value);

  return (
    <div className={cn("bg-card", className)}>
      <button
        onClick={() => toggle(value)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left font-medium transition-colors hover:bg-muted/50"
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-0 text-sm text-muted-foreground prose-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
