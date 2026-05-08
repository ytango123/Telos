"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, BookOpen, Clock, CheckCircle, XCircle, Loader2, Trash2, Play } from "lucide-react";
import { api, Block } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const statusConfig = {
  draft: { label: "草稿", icon: Clock, variant: "secondary" as const },
  processing: { label: "生成中", icon: Loader2, variant: "default" as const },
  completed: { label: "已完成", icon: CheckCircle, variant: "default" as const },
  failed: { label: "失败", icon: XCircle, variant: "destructive" as const },
};

const depthLabels = {
  quick_overview: "Standard",
  standard: "Standard",
  deep_dive: "Deep Learning",
};

const DELETE_CONFIRM_SKIP_KEY = "telos_skip_delete_confirm";

/** 去掉末尾省略号，由前端动态点号承接 */
function generationStatusBaseText(message: string | null): string {
  if (!message?.trim()) return "正在生成课程";
  const trimmed = message.replace(/[。.…]+\s*$/u, "").trim();
  return trimmed || "正在生成课程";
}

function AnimatedEllipsis() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setPhase((p) => (p + 1) % 3), 480);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span
      className="inline-block min-w-[3ch] text-left font-mono tracking-tight"
      aria-hidden
    >
      {".".repeat(phase + 1)}
    </span>
  );
}

export default function BlocksPage() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Block | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["blocks"],
    queryFn: ({ signal }) => api.getBlocks(undefined, { signal }),
    retry: 1,
    retryDelay: 1000,
    refetchInterval: (query) => {
      const list = query.state.data?.blocks ?? [];
      return list.some((b) => b.status === "processing") ? 2000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBlock(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["blocks"] });
      const previous = queryClient.getQueryData<{ blocks: Block[]; total: number }>(["blocks"]);
      queryClient.setQueryData<{ blocks: Block[]; total: number }>(["blocks"], (old) => {
        if (!old) return old;
        const nextBlocks = old.blocks.filter((b) => b.id !== id);
        return {
          blocks: nextBlocks,
          total: Math.max(0, old.total - 1),
        };
      });
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["blocks"], context.previous);
      }
      alert(`删除失败: ${(error as Error).message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => api.generateCourse(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
      await queryClient.refetchQueries({ queryKey: ["blocks"] });
    },
    onError: (error) => {
      console.error("Generation error:", error);
      alert(`生成失败: ${(error as Error).message}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelGeneration(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["blocks"] });
      const previous = queryClient.getQueryData<{ blocks: Block[]; total: number }>(["blocks"]);
      queryClient.setQueryData<{ blocks: Block[]; total: number }>(["blocks"], (old) => {
        if (!old) return old;
        return {
          ...old,
          blocks: old.blocks.map((block) =>
            block.id === id
              ? {
                  ...block,
                  status: "draft",
                  generation_progress: 0,
                  status_message: "已取消生成",
                  course_id: null,
                  title: "新任务",
                }
              : block
          ),
        };
      });
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["blocks"], context.previous);
      }
      console.error("Cancel error:", error);
      alert(`取消失败: ${(error as Error).message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
    },
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(DELETE_CONFIRM_SKIP_KEY);
    setSkipDeleteConfirm(saved === "1");
  }, []);

  const requestDelete = (block: Block) => {
    if (skipDeleteConfirm) {
      deleteMutation.mutate(block.id);
      return;
    }
    setDontAskAgain(false);
    setDeleteTarget(block);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (dontAskAgain && typeof window !== "undefined") {
      window.localStorage.setItem(DELETE_CONFIRM_SKIP_KEY, "1");
      setSkipDeleteConfirm(true);
    }
    const id = deleteTarget.id;
    setDeleteTarget(null);
    deleteMutation.mutate(id);
  };

  if (isPending && !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">正在从后端加载列表…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-destructive font-medium">加载失败</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {(error as Error).message}
          </p>
          <Button className="mt-4" variant="outline" onClick={() => refetch()}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  const blocks = data?.blocks || [];

  return (
    <>
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="关闭删除确认"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative z-[1] w-full max-w-[460px] rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h3 id="delete-confirm-title" className="text-lg font-semibold">
              确认删除该学习任务？
            </h3>
            <p className="mt-2 text-sm text-muted-foreground break-all">
              将删除“{deleteTarget.title}”及已生成课程内容，此操作不可恢复。
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={dontAskAgain}
                onChange={(e) => setDontAskAgain(e.target.checked)}
              />
              不再提醒
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    删除中...
                  </>
                ) : (
                  "确认删除"
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">我的学习</h1>
          <p className="text-muted-foreground mt-1">
            管理你的学习任务，查看生成的课程
          </p>
        </div>
        <Link href="/blocks/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            新建学习任务
          </Button>
        </Link>
      </div>

      {blocks.length === 0 ? (
        <Card className="text-center py-16">
          <CardContent>
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">还没有学习任务</h3>
            <p className="text-muted-foreground mb-4">
              创建你的第一个学习任务，AI 将为你生成定制化课程
            </p>
            <Link href="/blocks/new">
              <Button>创建学习任务</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              onDelete={() => requestDelete(block)}
              onGenerate={() => generateMutation.mutate(block.id)}
              onCancel={() => cancelMutation.mutate(block.id)}
              isDeleting={deleteMutation.isPending && deleteMutation.variables === block.id}
              isGenerating={generateMutation.isPending && generateMutation.variables === block.id}
              isCancelling={cancelMutation.isPending && cancelMutation.variables === block.id}
            />
          ))}
        </div>
      )}
      </div>
    </>
  );
}

function BlockCard({
  block,
  onDelete,
  onGenerate,
  onCancel,
  isDeleting,
  isGenerating,
  isCancelling,
}: {
  block: Block;
  onDelete: () => void;
  onGenerate: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  isGenerating: boolean;
  isCancelling: boolean;
}) {
  const status = statusConfig[block.status];
  const StatusIcon = status.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">{block.title}</CardTitle>
            {block.description && (
              <CardDescription className="line-clamp-2">
                {block.description}
              </CardDescription>
            )}
          </div>
          <Badge variant={status.variant} className="gap-1">
            <StatusIcon className={`h-3 w-3 ${block.status === "processing" ? "animate-spin" : ""}`} />
            {status.label}
            {block.status === "processing" && ` ${block.generation_progress}%`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
          {block.target && (
            <span>目标: {block.target}</span>
          )}
          <span>深度: {depthLabels[block.target_depth]}</span>
          <span>创建于: {new Date(block.created_at).toLocaleDateString("zh-CN")}</span>
        </div>
        
        <Separator className="my-4" />
        
        <div className="flex flex-wrap items-center gap-2 w-full">
          {block.status === "draft" && (
            <>
              <Link href={`/blocks/${block.id}`}>
                <Button variant="outline" size="sm">
                  编辑
                </Button>
              </Link>
              <Button
                size="sm"
                onClick={onGenerate}
                disabled={isGenerating}
                className="gap-1"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                开始生成
              </Button>
            </>
          )}
          {block.status === "completed" && block.course_id && (
            <Link href={`/learn/${block.course_id}`}>
              <Button size="sm" className="gap-1">
                <BookOpen className="h-3 w-3" />
                开始学习
              </Button>
            </Link>
          )}
          {block.status === "processing" && (
            <>
              <span className="text-sm text-muted-foreground flex-1 min-w-0 inline-flex flex-wrap items-baseline gap-0">
                <span>{generationStatusBaseText(block.status_message)}</span>
                <AnimatedEllipsis />
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={onCancel}
                disabled={isCancelling}
              >
                {isCancelling ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "取消生成"
                )}
              </Button>
            </>
          )}
          {block.status === "failed" && (
            <>
              <span className="text-sm text-destructive">
                {block.status_message || "生成失败"}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={onGenerate}
                disabled={isGenerating}
              >
                重试
              </Button>
            </>
          )}
          
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              disabled={isDeleting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
