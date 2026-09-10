"use client";

import { MarkdownHooks } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeShiki from "@shikijs/rehype";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import "katex/dist/katex.min.css";
import { ImageZoom } from "fumadocs-ui/components/image-zoom";

import { CodeBlock, Pre, Code } from "@/components/mdx/code-block";
import { FilesTree } from "@/components/mdx/files-tree";
import { H2, H3, H4 } from "@/components/mdx/heading";
import { Steps, Step } from "@/components/mdx/steps";
import { KeyPoint, SummaryBox } from "@/components/mdx/highlight";
import { VideoEmbed } from "@/components/learn/video-embed";
import { MermaidDiagram } from "@/components/learn/mermaid-diagram";
import { cn } from "@/lib/utils";
import type { ReactNode, HTMLAttributes } from "react";

/**
 * Hosts that block direct image loading without a matching Referer.
 * For these we route through the backend image proxy.
 */
const HOTLINK_HOSTS = [
  "zhimg.com",
  "xiaohongshu.com",
  "xhscdn.com",
  "mmbiz.qpic.cn",
  "sinaimg.cn",
  "hdslb.com",
];

function shouldProxyImage(src: string): boolean {
  try {
    const u = new URL(src, "http://localhost");
    if (!/^https?:$/.test(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    return HOTLINK_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

function resolveImageSrc(src: string): string {
  if (!src) return src;
  if (src.startsWith("/api/proxy/image")) return src;
  return shouldProxyImage(src)
    ? `/api/proxy/image?url=${encodeURIComponent(src)}`
    : src;
}

interface MarkdownContentProps {
  content: string;
}

function extractCodeMeta(className?: string): { language?: string } {
  if (!className) return {};
  const languageMatch = className.match(/language-([^\s]+)/);
  return { language: languageMatch?.[1] };
}

function encodeMermaidSource(code: string): string {
  if (typeof window === "undefined") {
    // Server-side: use Node's Buffer to avoid btoa issues with non-ASCII.
    return Buffer.from(code, "utf-8").toString("base64");
  }
  try {
    return window.btoa(unescape(encodeURIComponent(code)));
  } catch {
    return "";
  }
}

function extractMermaidBlocks(input: string): string {
  // ```mermaid\n ... \n```  -> <div data-telos-mermaid="base64"></div>
  // Done before markdown parsing so Shiki never gets a chance to mangle it.
  return input.replace(
    /```mermaid\s*\n([\s\S]*?)```/g,
    (_match, code: string) => {
      const trimmed = code.replace(/\s+$/g, "");
      const encoded = encodeMermaidSource(trimmed);
      return `\n\n<div data-telos-mermaid="${encoded}"></div>\n\n`;
    },
  );
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  // Pre-process colored highlight syntax
  // ==text== or ==yellow:text== → yellow (default)
  // ==red:text== → red
  // ==green:text== → green
  // ==blue:text== → blue
  // ==purple:text== → purple
  const processedContent = extractMermaidBlocks(content)
    .replace(/==red:([^=]+)==/g, '<mark class="hl-red">$1</mark>')
    .replace(/==green:([^=]+)==/g, '<mark class="hl-green">$1</mark>')
    .replace(/==blue:([^=]+)==/g, '<mark class="hl-blue">$1</mark>')
    .replace(/==purple:([^=]+)==/g, '<mark class="hl-purple">$1</mark>')
    .replace(/==yellow:([^=]+)==/g, '<mark class="hl-yellow">$1</mark>')
    .replace(/==([^=:]+)==/g, '<mark class="hl-yellow">$1</mark>');

  return (
    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-m-20">
      <MarkdownHooks
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeShiki,
            {
              themes: {
                light: "github-light",
                dark: "github-dark",
              },
              defaultLanguage: "text",
              fallbackLanguage: "text",
              addLanguageClass: true,
            },
          ],
          rehypeKatex,
          rehypeRaw,
        ]}
        fallback={<div className="text-sm text-muted-foreground">加载课程内容中...</div>}
        components={{
          h2: ({ children }) => <H2>{children}</H2>,
          h3: ({ children }) => <H3>{children}</H3>,
          h4: ({ children }) => <H4>{children}</H4>,

          p: ({ children, node }) => {
            // Unwrap <p> when its only child is a block-level media element.
            // markdown puts standalone images in their own paragraph; we render
            // them as <figure>, which is invalid inside <p>.
            const kids = (node as { children?: Array<{ type?: string; tagName?: string }> } | undefined)?.children ?? [];
            const meaningful = kids.filter(
              (c) => !(c.type === "text" && !((c as unknown as { value?: string }).value ?? "").trim())
            );
            if (
              meaningful.length === 1 &&
              meaningful[0].type === "element" &&
              (meaningful[0].tagName === "img" || meaningful[0].tagName === "div")
            ) {
              return <>{children}</>;
            }
            return (
              <p className="mb-4 leading-7 text-zinc-700 dark:text-zinc-300 [&:not(:first-child)]:mt-4">{children}</p>
            );
          },

          blockquote: ({ children }) => (
            <blockquote className="mt-6 border-l-2 border-zinc-300 dark:border-zinc-600 pl-4 text-zinc-600 dark:text-zinc-400 [&>p]:my-2">
              {children}
            </blockquote>
          ),

          ul: ({ children }) => (
            <ul className="my-4 ml-6 list-disc space-y-2 text-zinc-700 dark:text-zinc-300 [&>li]:leading-7">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 ml-6 list-decimal space-y-2 text-zinc-700 dark:text-zinc-300 [&>li]:leading-7">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="leading-7">{children}</li>
          ),

          code: ({ className, children, ...props }) => {
            const { language } = extractCodeMeta(className);
            const isInline = !language && !className?.includes("language-");

            if (isInline) {
              return <Code {...props}>{children}</Code>;
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },

          pre: ({ children }) => {
            const codeElement = children as React.ReactElement<{ className?: string; children?: ReactNode }>;
            const className = codeElement?.props?.className;
            const { language } = extractCodeMeta(className);
            const codeChildren = codeElement?.props?.children;
            const rawCode = Array.isArray(codeChildren)
              ? codeChildren.join("")
              : typeof codeChildren === "string"
                ? codeChildren
                : "";

            if (language === "files") {
              return <FilesTree content={rawCode} />;
            }

            return (
              <CodeBlock language={language}>
                <Pre>{children}</Pre>
              </CodeBlock>
            );
          },

          table: ({ children }) => (
            <div className="my-6 w-full overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full border-collapse text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-50 dark:bg-zinc-800/50">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 text-zinc-700 dark:text-zinc-300">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="transition-colors hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">{children}</tr>
          ),

          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 dark:text-zinc-100 underline decoration-zinc-400 dark:decoration-zinc-600 underline-offset-4 transition-colors hover:decoration-zinc-600 dark:hover:decoration-zinc-400"
            >
              {children}
            </a>
          ),

          img: ({ src, alt }) => {
            const rawSrc = typeof src === "string" ? src : "";
            const finalSrc = resolveImageSrc(rawSrc);
            return (
              <figure className="my-8 flex flex-col items-center">
                <ImageZoom
                  src={finalSrc}
                  alt={alt || ""}
                  className="mx-auto max-w-full rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800"
                />
              </figure>
            );
          },

          div: ({ children, ...props }: HTMLAttributes<HTMLDivElement> & {
            "data-telos-video"?: string;
            "data-telos-video-url"?: string;
            "data-telos-mermaid"?: string;
          }) => {
            const videoMeta = props["data-telos-video"];
            if (videoMeta) {
              const [platform, ...rest] = videoMeta.split(":");
              const videoId = rest.join(":");
              if (platform && videoId) {
                return (
                  <VideoEmbed
                    platform={platform}
                    videoId={videoId}
                    url={props["data-telos-video-url"]}
                  />
                );
              }
            }
            const mermaidEncoded = props["data-telos-mermaid"];
            if (typeof mermaidEncoded === "string") {
              let decoded = "";
              try {
                decoded =
                  typeof window === "undefined"
                    ? Buffer.from(mermaidEncoded, "base64").toString("utf-8")
                    : decodeURIComponent(escape(window.atob(mermaidEncoded)));
              } catch {
                decoded = "";
              }
              return <MermaidDiagram code={decoded} />;
            }
            return <div {...props}>{children}</div>;
          },

          hr: () => null,

          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
          ),

          em: ({ children }) => (
            <em className="italic text-zinc-700 dark:text-zinc-300">{children}</em>
          ),

          mark: ({ children, className }) => {
            // Soft, warm highlight colors - text stays dark/readable, with bold
            const colorStyles: Record<string, string> = {
              "hl-yellow": "bg-amber-100/80 dark:bg-amber-900/40",
              "hl-red": "bg-rose-100/80 dark:bg-rose-900/40",
              "hl-green": "bg-emerald-100/80 dark:bg-emerald-900/40",
              "hl-blue": "bg-sky-100/80 dark:bg-sky-900/40",
              "hl-purple": "bg-violet-100/80 dark:bg-violet-900/40",
            };

            const bgClass = className && colorStyles[className]
              ? colorStyles[className]
              : colorStyles["hl-yellow"];

            return (
              <mark className={cn(
                "rounded px-1 py-0.5 text-inherit font-semibold",
                bgClass
              )}>
                {children}
              </mark>
            );
          },
        }}
      >
        {processedContent}
      </MarkdownHooks>
    </div>
  );
}

export { Steps, Step, KeyPoint, SummaryBox };
