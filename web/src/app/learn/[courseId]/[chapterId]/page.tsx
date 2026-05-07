"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Home, Loader2, Menu, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChapterNav } from "@/components/learn/chapter-nav";
import { MarkdownContent } from "@/components/learn/markdown-content";
import { cn } from "@/lib/utils";

export default function ChapterPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const chapterId = params.chapterId as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: course, isLoading, error } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.getCourse(courseId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">课程不存在</h2>
          <p className="text-muted-foreground">
            {(error as Error)?.message || "找不到该课程"}
          </p>
        </div>
      </div>
    );
  }

  const chapters = course.chapters || [];
  const currentIndex = chapters.findIndex((c) => c.id === chapterId);
  const currentChapter = chapters[currentIndex];
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">章节不存在</h2>
          <p className="text-muted-foreground">找不到该章节</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center px-4 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
          
          <Link href="/blocks" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">返回</span>
          </Link>
          
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{course.title}</h1>
          </div>
          
          <div className="text-sm text-muted-foreground">
            {currentIndex + 1} / {chapters.length}
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 w-64 bg-background border-r transform transition-transform md:relative md:translate-x-0 pt-14 md:pt-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="h-full overflow-y-auto p-4">
            <ChapterNav
              courseId={courseId}
              chapters={chapters}
              currentChapterId={chapterId}
            />
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <article className="max-w-3xl mx-auto px-4 py-8 md:px-8">
            <h1 className="text-3xl font-bold mb-8">{currentChapter.title}</h1>
            
            {currentChapter.content ? (
              <MarkdownContent content={currentChapter.content} />
            ) : (
              <p className="text-muted-foreground">该章节暂无内容</p>
            )}
          </article>

          {/* Chapter Navigation */}
          <nav className="border-t">
            <div className="max-w-3xl mx-auto px-4 py-6 md:px-8 flex items-center justify-between">
              {prevChapter ? (
                <Link href={`/learn/${courseId}/${prevChapter.id}`}>
                  <Button variant="outline" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">上一章</span>
                  </Button>
                </Link>
              ) : (
                <div />
              )}

              {nextChapter ? (
                <Link href={`/learn/${courseId}/${nextChapter.id}`}>
                  <Button className="gap-2">
                    <span className="hidden sm:inline">下一章</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Link href="/blocks">
                  <Button className="gap-2">
                    完成学习
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        </main>
      </div>
    </div>
  );
}
