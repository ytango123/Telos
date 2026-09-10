"use client";

import { Check, Clipboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type ComponentProps,
  type RefObject,
} from "react";

// Language display names and icons
const languageConfig: Record<string, { icon: string; name: string }> = {
  typescript: { icon: "TS", name: "TypeScript" },
  ts: { icon: "TS", name: "TypeScript" },
  javascript: { icon: "JS", name: "JavaScript" },
  js: { icon: "JS", name: "JavaScript" },
  jsx: { icon: "JSX", name: "JSX" },
  tsx: { icon: "TSX", name: "TSX" },
  python: { icon: "PY", name: "Python" },
  py: { icon: "PY", name: "Python" },
  rust: { icon: "RS", name: "Rust" },
  go: { icon: "GO", name: "Go" },
  java: { icon: "JA", name: "Java" },
  cpp: { icon: "C++", name: "C++" },
  c: { icon: "C", name: "C" },
  csharp: { icon: "C#", name: "C#" },
  cs: { icon: "C#", name: "C#" },
  html: { icon: "HTML", name: "HTML" },
  css: { icon: "CSS", name: "CSS" },
  json: { icon: "JSON", name: "JSON" },
  yaml: { icon: "YAML", name: "YAML" },
  yml: { icon: "YAML", name: "YAML" },
  bash: { icon: "SH", name: "Bash" },
  shell: { icon: "SH", name: "Shell" },
  sh: { icon: "SH", name: "Shell" },
  sql: { icon: "SQL", name: "SQL" },
  markdown: { icon: "MD", name: "Markdown" },
  md: { icon: "MD", name: "Markdown" },
  php: { icon: "PHP", name: "PHP" },
  ruby: { icon: "RB", name: "Ruby" },
  swift: { icon: "SW", name: "Swift" },
  kotlin: { icon: "KT", name: "Kotlin" },
};

interface CodeBlockProps extends ComponentProps<"figure"> {
  title?: string;
  language?: string;
  allowCopy?: boolean;
  keepBackground?: boolean;
  viewportProps?: HTMLAttributes<HTMLElement>;
  "data-line-numbers"?: boolean;
  "data-line-numbers-start"?: number;
  Actions?: (props: { className?: string; children?: ReactNode }) => ReactNode;
  children: ReactNode;
}

export function CodeBlock({
  language,
  allowCopy = true,
  keepBackground = false,
  viewportProps = {},
  Actions = (props) => <div {...props} className={cn("empty:hidden", props.className)} />,
  children,
  className,
  ...props
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(async () => {
    const code = codeRef.current?.querySelector("pre")?.textContent;
    if (code) {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      await navigator.clipboard.writeText(code);
      setCopied(true);
      timeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const lang = language?.toLowerCase();
  const config = lang ? languageConfig[lang] : null;
  const displayLanguage = config?.name || (lang ? lang.toUpperCase() : null);

  return (
    <figure
      className={cn(
        "my-4 bg-zinc-100 dark:bg-zinc-900/60 rounded-xl shiki relative border shadow-sm not-prose overflow-hidden text-sm",
        keepBackground && "bg-(--shiki-light-bg) dark:bg-(--shiki-dark-bg)",
        className
      )}
      {...props}
      tabIndex={-1}
      dir="ltr"
    >
      {/* Header with language only */}
      {displayLanguage && (
        <div className="flex text-muted-foreground items-center gap-2 h-9.5 border-b px-4">
          {config && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded bg-zinc-200 dark:bg-zinc-800 text-[10px] font-bold px-1">
              {config.icon}
            </span>
          )}
          <figcaption className="flex-1 truncate text-sm">{displayLanguage}</figcaption>
          {Actions({
            className: "-me-2",
            children: allowCopy && <CopyButton checked={copied} onClick={handleCopy} containerRef={codeRef} />,
          })}
        </div>
      )}

      {/* Code area */}
      <div
        ref={codeRef}
        {...viewportProps}
        role="region"
        tabIndex={0}
        className={cn(
          "text-[0.8125rem] py-3.5 overflow-auto max-h-[600px] fd-scroll-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          viewportProps.className
        )}
        style={
          {
            "--padding-right": !displayLanguage ? "calc(var(--spacing) * 8)" : undefined,
            counterSet: props["data-line-numbers"]
              ? `line ${Number(props["data-line-numbers-start"] ?? 1) - 1}`
              : undefined,
            ...viewportProps.style,
          } as CSSProperties
        }
      >
        {/* Copy button when header hidden */}
        {!displayLanguage && (
          Actions({
            className: "absolute top-3 right-2 z-2 backdrop-blur-lg rounded-lg text-muted-foreground",
            children: allowCopy && <CopyButton checked={copied} onClick={handleCopy} containerRef={codeRef} />,
          })
        )}
        {children}
      </div>
    </figure>
  );
}

function CopyButton({
  className,
  checked,
  onClick,
  containerRef: _containerRef,
  ...props
}: ComponentProps<"button"> & {
  checked: boolean;
  onClick: () => void;
  containerRef: RefObject<HTMLElement | null>;
}) {
  return (
    <button
      type="button"
      data-checked={checked || undefined}
      className={cn(
        buttonVariants({
          variant: "ghost",
          size: "icon-sm",
          className: "hover:text-foreground data-[checked]:text-foreground",
        }),
        className
      )}
      aria-label={checked ? "Copied Text" : "Copy Text"}
      onClick={onClick}
      {...props}
    >
      {checked ? <Check /> : <Clipboard />}
    </button>
  );
}

export function Pre({ children, className, ...props }: ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "min-w-full w-max font-mono",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  );
}

export function Code({ children, className, ...props }: ComponentProps<"code">) {
  const isInline = !className?.includes("language-");

  if (isInline) {
    return (
      <code
        className={cn(
          "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.875em]",
          className
        )}
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <code className={cn("block", className)} {...props}>
      {children}
    </code>
  );
}
