"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Home, Loader2, Menu, X } from "lucide-react";
import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ChapterNav } from "@/components/learn/chapter-nav";
import { MarkdownContent } from "@/components/learn/markdown-content";
import { TOC, extractTOCFromContent } from "@/components/mdx/toc";
import { cn } from "@/lib/utils";

export default function ChapterPage() {
  const params = useParams();
  const courseId = params.courseId as string;
  const chapterId = params.chapterId as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chapterNavCollapsed, setChapterNavCollapsed] = useState(false);

  const { data: course, isLoading, error } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => api.getCourse(courseId),
  });

  const currentChapter = useMemo(() => {
    if (!course?.chapters) return null;
    return course.chapters.find((c) => c.id === chapterId) || null;
  }, [course, chapterId]);

  const tocItems = useMemo(() => {
    if (!currentChapter?.content) return [];
    return extractTOCFromContent(currentChapter.content);
  }, [currentChapter?.content]);

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
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4 gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>

          <Link href="/blocks" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">返回列表</span>
          </Link>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{course.title}</h1>
          </div>

          <div className="text-sm text-muted-foreground tabular-nums">
            {currentIndex + 1} / {chapters.length}
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* Left Sidebar - Chapter Navigation */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 bg-background border-r transform overflow-visible",
            "lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 pt-14 lg:pt-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            "w-64 lg:translate-x-0",
            chapterNavCollapsed ? "lg:w-0 lg:border-r-0" : "lg:w-64"
          )}
        >
          <button
            type="button"
            onClick={() => setChapterNavCollapsed((prev) => !prev)}
            className="hidden lg:flex absolute top-1/5 left-full -translate-y-1/2 z-50 h-12 w-6 items-center justify-center rounded-r-xl border border-l-0 bg-background shadow-md transition-colors hover:bg-muted"
            aria-label={chapterNavCollapsed ? "展开章节目录" : "收起章节目录"}
          >
            {chapterNavCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          <div
            className={cn(
              "h-full overflow-y-auto p-4",
              chapterNavCollapsed && "lg:opacity-0 lg:pointer-events-none"
            )}
          >
            <ChapterNav
              courseId={courseId}
              chapters={chapters}
              currentChapterId={chapterId}
            />
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main
          className={cn(
            "flex-1 min-w-0 lg:ml-64",
            chapterNavCollapsed && "lg:ml-0"
          )}
        >
          {/* Floating TOC */}
          {tocItems.length > 0 && (
            <div className="hidden lg:block fixed top-20 right-4 z-30 w-60 max-h-[calc(100vh-6rem)]">
              <div className="rounded-xl border bg-background/80 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70 overflow-y-auto transition-all duration-200 opacity-85 hover:opacity-100 hover:shadow-md">
                <TOC items={tocItems} title="本章目录" />
              </div>
            </div>
          )}

          {/* Article Content */}
          <article className="min-w-0 max-w-6xl mx-auto px-3 py-8 lg:px-6 lg:pr-64">
              {/* Chapter Title */}
              <div className="mb-8">
                <div className="text-sm text-muted-foreground mb-2">
                  第 {currentIndex + 1} 章
                </div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {currentChapter.title}
                </h1>
              </div>

              {/* Chapter Content */}
              {currentChapter.content ? (
                <MarkdownContent content={currentChapter.content} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>该章节暂无内容</p>
                </div>
              )}

              {/* Chapter Navigation Footer */}
              <nav className="mt-12 pt-8 border-t">
                <div className="flex items-center justify-between gap-4">
                  {prevChapter ? (
                    <Link href={`/learn/${courseId}/${prevChapter.id}`} className="flex-1">
                      <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3 px-4">
                        <ArrowLeft className="h-4 w-4 shrink-0" />
                        <div className="text-left min-w-0">
                          <div className="text-xs text-muted-foreground">上一章</div>
                          <div className="text-sm font-medium truncate">{prevChapter.title}</div>
                        </div>
                      </Button>
                    </Link>
                  ) : (
                    <div className="flex-1" />
                  )}

                  {nextChapter ? (
                    <Link href={`/learn/${courseId}/${nextChapter.id}`} className="flex-1">
                      <Button className="w-full justify-end gap-2 h-auto py-3 px-4">
                        <div className="text-right min-w-0">
                          <div className="text-xs text-primary-foreground/70">下一章</div>
                          <div className="text-sm font-medium truncate">{nextChapter.title}</div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </Button>
                    </Link>
                  ) : (
                    <Link href="/blocks" className="flex-1">
                      <Button className="w-full justify-end gap-2 h-auto py-3 px-4">
                        <div className="text-right">
                          <div className="text-xs text-primary-foreground/70">恭喜完成</div>
                          <div className="text-sm font-medium">返回学习列表</div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0" />
                      </Button>
                    </Link>
                  )}
                </div>
              </nav>
          </article>
        </main>
      </div>
    </div>
  );
}
