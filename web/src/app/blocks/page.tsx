"use client";

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
  quick_overview: "快速了解",
  standard: "标准学习",
  deep_dive: "深入研究",
};

export default function BlocksPage() {
  const queryClient = useQueryClient();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["blocks"],
    queryFn: () => api.getBlocks(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBlock(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (id: string) => api.generateCourse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
    },
    onError: (error) => {
      console.error("Generation error:", error);
      alert(`生成失败: ${(error as Error).message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-destructive">
          加载失败：{(error as Error).message}
        </div>
      </div>
    );
  }

  const blocks = data?.blocks || [];

  return (
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
              onDelete={() => deleteMutation.mutate(block.id)}
              onGenerate={() => generateMutation.mutate(block.id)}
              isDeleting={deleteMutation.isPending}
              isGenerating={generateMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockCard({
  block,
  onDelete,
  onGenerate,
  isDeleting,
  isGenerating,
}: {
  block: Block;
  onDelete: () => void;
  onGenerate: () => void;
  isDeleting: boolean;
  isGenerating: boolean;
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
        
        <div className="flex items-center gap-2">
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
            <span className="text-sm text-muted-foreground">
              {block.status_message || "正在生成课程..."}
            </span>
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
              disabled={isDeleting || block.status === "processing"}
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
