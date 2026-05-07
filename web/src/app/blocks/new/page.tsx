"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { api, BlockCreate } from "@/lib/api";
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

export default function NewBlockPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<BlockCreate>({
    title: "",
    description: "",
    target: "",
    target_depth: "standard",
    source_preferences: [],
  });

  const createMutation = useMutation({
    mutationFn: (data: BlockCreate) => api.createBlock(data),
    onSuccess: (block) => {
      router.push(`/blocks/${block.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    createMutation.mutate(formData);
  };

  const toggleSource = (sourceId: string) => {
    setFormData((prev) => ({
      ...prev,
      source_preferences: prev.source_preferences?.includes(sourceId)
        ? prev.source_preferences.filter((s) => s !== sourceId)
        : [...(prev.source_preferences || []), sourceId],
    }));
  };

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
            创建学习任务
          </CardTitle>
          <CardDescription>
            描述你想学习的内容，AI 将为你生成定制化的学习课程
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 标题 */}
            <div className="space-y-2">
              <Label htmlFor="title">
                学习主题 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="例如：理解 Transformer 架构原理"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                required
              />
            </div>

            {/* 描述 */}
            <div className="space-y-2">
              <Label htmlFor="description">详细描述</Label>
              <Textarea
                id="description"
                placeholder="详细描述你想学习的内容、背景知识、已有基础等..."
                rows={4}
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>

            {/* 学习目标 */}
            <div className="space-y-2">
              <Label htmlFor="target">学习目标</Label>
              <Textarea
                id="target"
                placeholder="例如：能在技术面试中清晰解释 Transformer 的核心机制..."
                rows={2}
                value={formData.target || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, target: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                明确的目标有助于 AI 生成更精准的内容
              </p>
            </div>

            {/* 深度选择 */}
            <div className="space-y-2">
              <Label>学习深度</Label>
              <Select
                value={formData.target_depth}
                onValueChange={(value: "quick_overview" | "standard" | "deep_dive") =>
                  setFormData((prev) => ({ ...prev, target_depth: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick_overview">
                    🚀 快速了解 - 3-4 章节，掌握核心概念
                  </SelectItem>
                  <SelectItem value="standard">
                    📚 标准学习 - 5-7 章节，全面覆盖主题
                  </SelectItem>
                  <SelectItem value="deep_dive">
                    🔬 深入研究 - 8-12 章节，深度技术细节
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 偏好来源 */}
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
                    className="cursor-pointer"
                    onClick={() => toggleSource(source.id)}
                  >
                    {source.label}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                选择你偏好的资料来源，AI 会优先参考这些平台
              </p>
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={!formData.title.trim() || createMutation.isPending}
                className="flex-1"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    创建中...
                  </>
                ) : (
                  "创建学习任务"
                )}
              </Button>
              <Link href="/blocks">
                <Button type="button" variant="outline">
                  取消
                </Button>
              </Link>
            </div>

            {createMutation.isError && (
              <p className="text-sm text-destructive">
                创建失败：{(createMutation.error as Error).message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
