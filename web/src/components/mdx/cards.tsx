"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface CardsProps {
  children: ReactNode;
  className?: string;
}

export function Cards({ children, className }: CardsProps) {
  return (
    <div
      className={cn(
        "my-6 grid gap-4 sm:grid-cols-2",
        className
      )}
    >
      {children}
    </div>
  );
}

interface CardProps {
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, description, href, icon, children, className }: CardProps) {
  const cardContent = (
    <>
      {icon && (
        <div className="mb-3 w-fit rounded-lg border bg-muted p-2 text-muted-foreground group-hover:text-primary">
          {icon}
        </div>
      )}
      <h3 className="font-semibold text-card-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      )}
      {children && (
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      )}
    </>
  );

  const cardClassName = cn(
    "group relative flex flex-col rounded-xl border bg-card p-4 transition-colors",
    href && "hover:border-primary/50 hover:bg-accent/50",
    className
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div className={cardClassName}>
      {cardContent}
    </div>
  );
}
