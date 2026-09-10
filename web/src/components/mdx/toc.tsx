"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Text } from "lucide-react";

export interface TOCItem {
  id: string;
  title: string;
  level: number;
}

interface TOCProps {
  items: TOCItem[];
  className?: string;
  title?: string;
}

export function TOC({ items, className, title = "目录" }: TOCProps) {
  const [activeId, setActiveId] = useState<string>("");

  const handleScroll = useCallback(() => {
    const headings = items.map(item => document.getElementById(item.id)).filter(Boolean);

    let currentId = "";
    for (const heading of headings) {
      if (heading) {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 120) {
          currentId = heading.id;
        }
      }
    }

    setActiveId(currentId);
  }, [items]);

  useEffect(() => {
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground">
        <Text className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(item.id)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
              className={cn(
                "block rounded-md px-2 py-1.5 transition-colors",
                item.level === 2 && "pl-2",
                item.level === 3 && "pl-5",
                item.level === 4 && "pl-8",
                activeId === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function extractTOCFromContent(content: string): TOCItem[] {
  const headingRegex = /^(#{2,4})\s+(.+)$/gm;
  const items: TOCItem[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const title = match[2].trim();
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-|-$/g, "");

    items.push({ id, title, level });
  }

  return items;
}
