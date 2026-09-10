"use client";

import { FileIcon, FolderIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilesTreeProps {
  content: string;
  className?: string;
}

interface FileNode {
  depth: number;
  name: string;
  isFolder: boolean;
}

function parseFilesTree(content: string): FileNode[] {
  const lines = content
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0);

  return lines.map((rawLine, index) => {
    let line = rawLine;
    let depth = 0;

    while (line.startsWith("│   ") || line.startsWith("    ")) {
      depth += 1;
      line = line.slice(4);
    }

    line = line.replace(/^[├└]──\s*/, "");
    const name = line.trim();
    const isRoot = index === 0 && !rawLine.includes("──");
    const isFolder = isRoot || name.endsWith("/") || (!name.includes(".") && !name.includes(" "));

    return {
      depth,
      name,
      isFolder,
    };
  });
}

export function FilesTree({ content, className }: FilesTreeProps) {
  const nodes = parseFilesTree(content);

  return (
    <div
      className={cn(
        "my-6 not-prose overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/70 p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40",
        className
      )}
    >
      <div className="space-y-0.5">
        {nodes.map((node, index) => (
          <div
            key={`${node.name}-${index}`}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
            style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
          >
            {node.isFolder ? (
              <FolderIcon className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            ) : (
              <FileIcon className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
            )}
            <span className="truncate">{node.name.replace(/\/$/, "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
