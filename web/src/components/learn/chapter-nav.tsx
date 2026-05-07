"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle, Circle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chapter } from "@/lib/api";

interface ChapterNavProps {
  courseId: string;
  chapters: Chapter[];
  currentChapterId?: string;
}

export function ChapterNav({ courseId, chapters, currentChapterId }: ChapterNavProps) {
  return (
    <nav className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
        <BookOpen className="h-4 w-4" />
        章节目录
      </div>
      {chapters.map((chapter, index) => {
        const isActive = chapter.id === currentChapterId;
        const isCompleted = currentChapterId
          ? chapters.findIndex((c) => c.id === currentChapterId) > index
          : false;

        return (
          <Link
            key={chapter.id}
            href={`/learn/${courseId}/${chapter.id}`}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted",
              !isActive && isCompleted && "text-muted-foreground"
            )}
          >
            <span className="flex-shrink-0">
              {isCompleted && !isActive ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Circle
                  className={cn(
                    "h-4 w-4",
                    isActive ? "fill-current" : "text-muted-foreground"
                  )}
                />
              )}
            </span>
            <span className="truncate">{chapter.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
