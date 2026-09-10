"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function getMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        themeVariables: {
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          fontSize: "14px",
        },
        flowchart: { curve: "basis", htmlLabels: true },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function detectDark(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("dark")) return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

let idSeed = 0;

export function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const trimmed = code.trim();
    if (!trimmed) {
      setSvg(null);
      setError(null);
      return;
    }

    async function render() {
      try {
        const mermaid = await getMermaid();
        const isDark = detectDark();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark ? "dark" : "default",
          themeVariables: {
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
            fontSize: "14px",
          },
          flowchart: { curve: "basis", htmlLabels: true },
        });
        idSeed += 1;
        const id = `telos-mermaid-${idSeed}`;
        const { svg: rendered } = await mermaid.render(id, trimmed);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div
        className={cn(
          "my-6 rounded-lg border border-rose-200 bg-rose-50/60 p-4 text-sm dark:border-rose-900/40 dark:bg-rose-950/30",
          className,
        )}
      >
        <p className="font-medium text-rose-700 dark:text-rose-300">Mermaid 渲染失败</p>
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        <pre className="mt-3 overflow-auto rounded bg-rose-100/60 p-3 text-xs text-rose-900 dark:bg-rose-900/40 dark:text-rose-100">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <figure
      className={cn(
        "mermaid-block my-6 flex justify-center overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/30",
        className,
      )}
    >
      {svg ? (
        <div
          ref={ref}
          className="w-full text-zinc-800 dark:text-zinc-100 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          ref={ref}
          className="flex w-full items-center justify-center text-xs text-zinc-500"
        >
          正在渲染图表…
        </div>
      )}
    </figure>
  );
}
