"use client";

import { Link as LinkIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

interface HeadingProps extends ComponentProps<"h1"> {
  as?: HeadingLevel;
  children?: ReactNode;
}

function generateId(children: ReactNode): string {
  if (typeof children === "string") {
    return children
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  return "";
}

export function Heading({ as: Component = "h1", children, className, id, ...props }: HeadingProps) {
  const headingId = id || generateId(children);

  const baseStyles = {
    h1: "scroll-m-20 text-3xl font-bold tracking-tight mt-8 mb-4",
    h2: "scroll-m-20 text-2xl font-semibold tracking-tight mt-10 mb-4",
    h3: "scroll-m-20 text-xl font-semibold tracking-tight mt-8 mb-3",
    h4: "scroll-m-20 text-lg font-semibold tracking-tight mt-6 mb-2",
    h5: "scroll-m-20 text-base font-semibold tracking-tight mt-4 mb-2",
    h6: "scroll-m-20 text-sm font-semibold tracking-tight mt-4 mb-2",
  };

  if (!headingId) {
    return (
      <Component className={cn(baseStyles[Component], className)} {...props}>
        {children}
      </Component>
    );
  }

  return (
    <Component
      id={headingId}
      className={cn(
        baseStyles[Component],
        "group flex items-center gap-2",
        className
      )}
      {...props}
    >
      <a href={`#${headingId}`} className="no-underline hover:no-underline">
        {children}
      </a>
      <LinkIcon
        aria-hidden
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Component>
  );
}

export function H1(props: Omit<HeadingProps, "as">) {
  return <Heading as="h1" {...props} />;
}

export function H2(props: Omit<HeadingProps, "as">) {
  return <Heading as="h2" {...props} />;
}

export function H3(props: Omit<HeadingProps, "as">) {
  return <Heading as="h3" {...props} />;
}

export function H4(props: Omit<HeadingProps, "as">) {
  return <Heading as="h4" {...props} />;
}
