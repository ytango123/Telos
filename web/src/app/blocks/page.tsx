"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  BookOpen,
  XCircle,
  Loader2,
  Trash2,
  Play,
  PencilLine,
  Sparkles,
} from "lucide-react";
import { api, Block } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogSurface,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { BlockFormDialog } from "@/components/blocks/block-form-dialog";
import { cn } from "@/lib/utils";

const DELETE_CONFIRM_SKIP_KEY = "telos_skip_delete_confirm";

const depthLabels: Record<string, string> = {
  standard: "Standard",
  deep_dive: "Deep Learning",
};

/** Soft status palette — saturation low, no neon. */
const statusStyle = (status: Block["status"]) => {
  switch (status) {
    case "draft":
      return {
        label: "草稿",
        dot: "bg-foreground/30",
        text: "text-muted-foreground",
        ring: "ring-border/60",
      };
    case "processing":
      return {
        label: "生成中",
        dot: "bg-[var(--accent-sky)]",
        text: "text-foreground/80",
        ring: "ring-[var(--accent-sky)]/30",
      };
    case "completed":
      return {
        label: "已完成",
        dot: "bg-[var(--accent-emerald)]",
        text: "text-foreground/80",
        ring: "ring-[var(--accent-emerald)]/30",
      };
    case "failed":
      return {
        label: "失败",
        dot: "bg-[var(--accent-rose)]",
        text: "text-[var(--accent-rose)]",
        ring: "ring-[var(--accent-rose)]/30",
      };
  }
};

function AnimatedDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = window.setInterval(() => setN((p) => (p % 3) + 1), 480);
    return () => window.clearInterval(id);
  }, []);
  return <span className="inline-block w-[1.5ch] text-left font-mono">{".".repeat(n)}</span>;
}

function BlocksPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const editId = params.get("edit");
  const isNewOpen = params.get("new") === "1";
  const isEditOpen = !!editId;

  const [deleteTarget, setDeleteTarget] = useState<Block | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["blocks"],
    queryFn: ({ signal }) => api.getBlocks(undefined, { signal }),
    retry: 1,
    retryDelay: 1000,
    refetchInterval: (q) =>
      (q.state.data?.blocks ?? []).some((b) => b.status === "processing") ? 2000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBlock(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["blocks"] });
      const previous = queryClient.getQueryData<{ blocks: Block[]; total: number }>(["blocks"]);
      queryClient.setQueryData<{ blocks: Block[]; total: number }>(["blocks"], (old) =>
        old
          ? { blocks: old.blocks.filter((b) => b.id !== id), total: Math.max(0, old.total - 1) }
          : old
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["blocks"], ctx.previous);
      alert(`删除失败: ${(err as Error).message}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["blocks"] }),
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => api.generateCourse(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
    },
    onError: (err) => alert(`生成失败: ${(err as Error).message}`),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelGeneration(id),
    onError: (err) => alert(`取消失败: ${(err as Error).message}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["blocks"] }),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSkipDeleteConfirm(window.localStorage.getItem(DELETE_CONFIRM_SKIP_KEY) === "1");
  }, []);

  const requestDelete = (b: Block) => {
    if (skipDeleteConfirm) return deleteMutation.mutate(b.id);
    setDontAskAgain(false);
    setDeleteTarget(b);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (dontAskAgain) {
      window.localStorage.setItem(DELETE_CONFIRM_SKIP_KEY, "1");
      setSkipDeleteConfirm(true);
    }
    deleteMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
  };

  const openCreate = () => router.push("/blocks?new=1", { scroll: false });
  const openEdit = (id: string) => router.push(`/blocks?edit=${id}`, { scroll: false });
  const closeForm = () => router.push("/blocks", { scroll: false });

  const blocks = data?.blocks ?? [];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
      {/* Page heading — anchored top-left */}
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Telos · Workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2.25rem] sm:leading-[1.1]">
            我的学习
          </h1>
        </div>
        <Button
          size="sm"
          className="motion-spring press-tactile h-9 gap-1.5 px-4 shadow-[var(--shadow-soft-2)]"
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          新建任务
        </Button>
      </header>

      {/* Body states */}
      {isPending && !data ? (
        <SkeletonList />
      ) : error && !data ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : blocks.length === 0 ? (
        <EmptyState onCreate={openCreate} />
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[var(--shadow-soft-1)]">
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              onDelete={() => requestDelete(block)}
              onGenerate={() => generateMutation.mutate(block.id)}
              onCancel={() => cancelMutation.mutate(block.id)}
              onEdit={() => openEdit(block.id)}
              isGenerating={generateMutation.isPending && generateMutation.variables === block.id}
              isCancelling={cancelMutation.isPending && cancelMutation.variables === block.id}
            />
          ))}
        </ul>
      )}

      {/* Create / Edit dialog */}
      <BlockFormDialog
        open={isNewOpen || isEditOpen}
        onOpenChange={(o) => { if (!o) closeForm(); }}
        blockId={editId ?? undefined}
        onCreated={(id) => setCelebrateId(id)}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogSurface className="max-w-[440px]">
          <DialogHeader title="删除该任务？" />
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              将永久删除「{deleteTarget?.title}」及其课程内容，无法恢复。
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-foreground"
              />
              不再提醒
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              删除
            </Button>
          </DialogFooter>
        </DialogSurface>
      </Dialog>

      {/* Celebrate after create */}
      <Dialog open={!!celebrateId} onOpenChange={(o) => { if (!o) setCelebrateId(null); }}>
        <DialogSurface className="max-w-[420px]">
          <div className="relative px-7 py-9 text-center">
            <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-[160%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,var(--accent-emerald)_0%,transparent_60%)] opacity-[0.12]" />
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-emerald)]/15 ring-1 ring-[var(--accent-emerald)]/25">
              <Sparkles
                className="h-5 w-5"
                strokeWidth={1.75}
                style={{ color: "var(--accent-emerald)" }}
              />
            </div>
            <h3 className="text-base font-semibold tracking-tight">任务已创建</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              点击「开始生成」让 AI 编排章节，也可以先继续编辑细节。
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                size="sm"
                className="motion-spring press-tactile gap-1.5"
                onClick={() => setCelebrateId(null)}
                autoFocus
              >
                好的
              </Button>
            </div>
          </div>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

export default function BlocksPage() {
  return (
    <Suspense fallback={<SkeletonList />}>
      <BlocksPageInner />
    </Suspense>
  );
}

// --- Row -------------------------------------------------------------------

function BlockRow({
  block,
  onDelete,
  onGenerate,
  onCancel,
  onEdit,
  isGenerating,
  isCancelling,
}: {
  block: Block;
  onDelete: () => void;
  onGenerate: () => void;
  onCancel: () => void;
  onEdit: () => void;
  isGenerating: boolean;
  isCancelling: boolean;
}) {
  const status = statusStyle(block.status)!;
  const isProcessing = block.status === "processing";
  const isCompleted = block.status === "completed";
  const isDraft = block.status === "draft";
  const isFailed = block.status === "failed";

  return (
    <li className="motion-spring group relative px-6 py-5 hover:bg-muted/30 sm:px-8 sm:py-6">
      <div className="flex items-start gap-5">
        {/* Status dot column */}
        <div className="mt-2 shrink-0">
          <span
            className={cn(
              "block h-2.5 w-2.5 rounded-full ring-[3px] ring-offset-0",
              status.dot,
              status.ring,
              isProcessing && "animate-pulse"
            )}
            aria-hidden
          />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="truncate text-[17px] font-semibold tracking-tight">
              {block.title}
            </h3>
            <span className={cn("text-xs font-medium", status.text)}>
              {status.label}
              {isProcessing && ` · ${block.generation_progress}%`}
            </span>
          </div>
          {block.description ? (
            <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted-foreground">
              {block.description}
            </p>
          ) : null}

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">
              {depthLabels[block.target_depth] ?? block.target_depth}
            </span>
            <span className="opacity-40">·</span>
            <span className="font-mono">
              {new Date(block.created_at).toLocaleDateString("zh-CN", {
                month: "short",
                day: "numeric",
              })}
            </span>
            {block.target ? (
              <>
                <span className="opacity-40">·</span>
                <span className="max-w-[36ch] truncate">目标 {block.target}</span>
              </>
            ) : null}
          </div>

          {/* Processing message */}
          {isProcessing && (
            <p className="mt-3 text-xs text-muted-foreground">
              {(block.status_message ?? "正在生成").replace(/[。.…]+\s*$/u, "")}
              <AnimatedDots />
            </p>
          )}
          {isFailed && block.status_message ? (
            <p className="mt-3 text-xs text-[var(--accent-rose)]">{block.status_message}</p>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          {isDraft && (
            <>
              <IconButton title="编辑" onClick={onEdit}>
                <PencilLine className="h-4 w-4" strokeWidth={1.75} />
              </IconButton>
              <Button
                size="sm"
                onClick={onGenerate}
                disabled={isGenerating}
                className="motion-spring press-tactile h-8 gap-1.5 px-3 shadow-[var(--shadow-soft-1)]"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" strokeWidth={2} />
                )}
                生成
              </Button>
            </>
          )}
          {isProcessing && (
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={isCancelling}
              className="h-8 px-3"
            >
              {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "取消"}
            </Button>
          )}
          {isCompleted && block.course_id && (
            <Link href={`/learn/${block.course_id}`}>
              <Button
                size="sm"
                className="motion-spring press-tactile h-8 gap-1.5 px-3 shadow-[var(--shadow-soft-1)]"
              >
                <BookOpen className="h-3.5 w-3.5" strokeWidth={1.75} />
                学习
              </Button>
            </Link>
          )}
          {isFailed && (
            <>
              <IconButton title="编辑" onClick={onEdit}>
                <PencilLine className="h-4 w-4" strokeWidth={1.75} />
              </IconButton>
              <Button
                size="sm"
                variant="outline"
                onClick={onGenerate}
                disabled={isGenerating}
                className="h-8 px-3"
              >
                重试
              </Button>
            </>
          )}
          <IconButton title="删除" onClick={onDelete} variant="danger">
            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

function IconButton({
  children,
  onClick,
  title,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "motion-spring flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted",
        variant === "danger"
          ? "hover:text-[var(--accent-rose)]"
          : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// --- State views -----------------------------------------------------------

function SkeletonList() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
      <div className="mb-10 space-y-2">
        <div className="h-3 w-32 rounded bg-muted/60" />
        <div className="h-9 w-48 rounded-md bg-muted/70" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex animate-pulse items-center gap-5 px-8 py-6 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/60">
            <div className="h-2.5 w-2.5 rounded-full bg-muted" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 w-1/3 rounded bg-muted/80" />
              <div className="h-3 w-3/4 rounded bg-muted/60" />
            </div>
            <div className="h-8 w-20 rounded-md bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 px-8 py-16 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-muted/70">
        <BookOpen className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="text-base font-semibold tracking-tight">还没有任务</h2>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">
        从一个想学的问题开始，让 AI 帮你编排课程。
      </p>
      <Button
        size="sm"
        className="motion-spring press-tactile mt-6 gap-1.5 shadow-[var(--shadow-soft-2)]"
        onClick={onCreate}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        新建任务
      </Button>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--accent-rose)]/30 bg-[var(--accent-rose)]/5 px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-rose)]/15">
        <XCircle className="h-5 w-5 text-[var(--accent-rose)]" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium">加载失败</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <Button size="sm" variant="outline" className="mt-5" onClick={onRetry}>
        重试
      </Button>
    </div>
  );
}
