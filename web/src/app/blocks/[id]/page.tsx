"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles, Play, BookOpen } from "lucide-react";
import { api, BlockUpdate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sourceOptions = [
  { id: "arxiv", label: "arXiv (学术论文)" },
  { id: "github", label: "GitHub" },
  { id: "csdn", label: "CSDN" },
  { id: "zhihu", label: "知乎" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "youtube", label: "YouTube" },
  { id: "bilibili", label: "B站" },
];

export default function EditBlockPage() {
  const router = useRouter();
  const params = useParams();
  const blockId = params.id as string;
  const queryClient = useQueryClient();

  const { data: block, isLoading, error } = useQuery({
    queryKey: ["block", blockId],
    queryFn: () => api.getBlock(blockId),
  });

  const [formData, setFormData] = useState<BlockUpdate>({
    title: "",
    description: "",
    target: "",
    target_depth: "standard",
    source_preferences: [],
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (block && !isInitialized) {
      setFormData({
        title: block.title,
        description: block.description || "",
        target: block.target || "",
        target_depth: block.target_depth,
        source_preferences: block.source_preferences,
      });
      setIsInitialized(true);
    }
  }, [block, isInitialized]);

  const updateMutation = useMutation({
    mutationFn: (data: BlockUpdate) => api.updateBlock(blockId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["block", blockId] });
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      setHasChanges(false);
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateCourse(blockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["block", blockId] });
      router.push("/blocks");
    },
  });

  const handleChange = (field: keyof BlockUpdate, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const toggleSource = (sourceId: string) => {
    const current = formData.source_preferences || [];
    const updated = current.includes(sourceId)
      ? current.filter((s) => s !== sourceId)
      : [...current, sourceId];
    handleChange("source_preferences", updated);
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleGenerate = () => {
    if (hasChanges) {
      updateMutation.mutate(formData, {
        onSuccess: () => {
          generateMutation.mutate();
        },
      });
    } else {
      generateMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-destructive">
          加载失败：{(error as Error)?.message || "Block 不存在"}
        </div>
      </div>
    );
  }

  const isProcessing = block.status === "processing";
  const isCompleted = block.status === "completed";

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Link
        href="/blocks"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        返回列表
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            编辑学习任务
          </CardTitle>
          <CardDescription>
            {isProcessing && "课程正在生成中..."}
            {isCompleted && "课程已生成完成"}
            {!isProcessing && !isCompleted && "修改学习任务配置，然后开始生成课程"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* 状态提示 */}
            {isProcessing && (
              <div className="bg-primary/10 rounded-lg p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium">正在生成课程 ({block.generation_progress}%)</p>
                  <p className="text-sm text-muted-foreground">{block.status_message}</p>
                </div>
              </div>
            )}

            {isCompleted && block.course_id && (
              <div className="bg-green-500/10 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-700">课程已生成完成</p>
                  <p className="text-sm text-muted-foreground">点击按钮开始学习</p>
                </div>
                <Link href={`/learn/${block.course_id}`}>
                  <Button className="gap-2">
                    <BookOpen className="h-4 w-4" />
                    开始学习
                  </Button>
                </Link>
              </div>
            )}

            {/* 表单 */}
            <div className="space-y-2">
              <Label htmlFor="title">
                学习主题 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title || ""}
                onChange={(e) => handleChange("title", e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">详细描述</Label>
              <Textarea
                id="description"
                rows={4}
                value={formData.description || ""}
                onChange={(e) => handleChange("description", e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">学习目标</Label>
              <Textarea
                id="target"
                rows={2}
                value={formData.target || ""}
                onChange={(e) => handleChange("target", e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <Label>学习深度</Label>
              <Select
                value={formData.target_depth}
                onValueChange={(value: "quick_overview" | "standard" | "deep_dive") =>
                  handleChange("target_depth", value)
                }
                disabled={isProcessing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick_overview">
                    🚀 快速了解 - 3-4 章节
                  </SelectItem>
                  <SelectItem value="standard">
                    📚 标准学习 - 5-7 章节
                  </SelectItem>
                  <SelectItem value="deep_dive">
                    🔬 深入研究 - 8-12 章节
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>偏好资料来源</Label>
              <div className="flex flex-wrap gap-2">
                {sourceOptions.map((source) => (
                  <Badge
                    key={source.id}
                    variant={
                      formData.source_preferences?.includes(source.id)
                        ? "default"
                        : "outline"
                    }
                    className={`cursor-pointer ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => !isProcessing && toggleSource(source.id)}
                  >
                    {source.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            {!isProcessing && !isCompleted && (
              <div className="flex gap-4 pt-4">
                <Button
                  onClick={handleSave}
                  variant="outline"
                  disabled={!hasChanges || updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  保存修改
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="flex-1 gap-2"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  开始生成课程
                </Button>
              </div>
            )}

            {(updateMutation.isError || generateMutation.isError) && (
              <p className="text-sm text-destructive">
                操作失败：{((updateMutation.error || generateMutation.error) as Error).message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
