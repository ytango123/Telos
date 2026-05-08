"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Upload, Plus, FileText, X } from "lucide-react";
import { api, BlockCreate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  const queryClient = useQueryClient();
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [textContent, setTextContent] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<BlockCreate>({
    title: "新任务",
    description: "",
    target: "",
    target_depth: "standard",
    source_preferences: [],
  });

  const goToBlocks = useCallback(() => {
    setCelebrateOpen(false);
    router.push("/blocks");
  }, [router]);

  useEffect(() => {
    if (!celebrateOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") goToBlocks();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [celebrateOpen, goToBlocks]);

  const createMutation = useMutation({
    mutationFn: async (data: BlockCreate) => {
      // Create the block
      const block = await api.createBlock(data);
      
      // Upload pending files if any
      for (const file of pendingFiles) {
        try {
          await api.uploadAttachment(block.id, file);
        } catch (err) {
          console.error("Failed to upload file:", err);
        }
      }
      
      return block;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      setCelebrateOpen(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description?.trim()) return;
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

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveTextContent = () => {
    if (!textContent.trim()) return;
    const blob = new Blob([textContent], { type: "text/plain" });
    const file = new File([blob], `note-${Date.now()}.txt`, { type: "text/plain" });
    setPendingFiles((prev) => [...prev, file]);
    setTextContent("");
    setShowTextInput(false);
  };

  return (
    <>
      {celebrateOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="created-celebrate-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300"
            aria-label="关闭并前往列表"
            onClick={goToBlocks}
          />
          <div
            className="relative z-[1] w-full max-w-[420px] overflow-hidden rounded-2xl border border-border/80 bg-card text-card-foreground shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] dark:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.55)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,var(--color-primary)_0%,transparent_70%)] opacity-[0.18]" />
            <div className="relative px-8 pb-8 pt-10 text-center sm:px-10 sm:pb-10 sm:pt-12">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-primary/25 to-primary/5 ring-2 ring-primary/25 ring-offset-2 ring-offset-card">
                <Sparkles
                  className="h-10 w-10 text-primary drop-shadow-sm"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Telos
              </p>
              <h2
                id="created-celebrate-title"
                className="mt-2 text-2xl font-bold tracking-tight sm:text-[1.65rem]"
              >
                学习任务已创建！
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">
                前往「我的学习」后，在对应卡片上点击
                <span className="font-medium text-foreground">「开始生成」</span>
                ，我们将根据你的主题与深度偏好，为你编排章节并撰写内容。你也可以先使用
                <span className="font-medium text-foreground">「编辑」</span>
                微调描述与目标，再开始生成。
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  size="lg"
                  className="h-11 min-w-[200px] gap-2 text-base shadow-md"
                  onClick={goToBlocks}
                  autoFocus
                >
                  前往我的学习
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-5 text-xs text-muted-foreground/90">
                按 Esc 或点击背景也可关闭
              </p>
            </div>
          </div>
        </div>
      ) : null}

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
            {/* 问题详情 */}
            <div className="space-y-2">
              <Label htmlFor="description">
                问题详情 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                placeholder="描述你想学习的内容、问题背景、已有基础等。AI 会根据这些内容自动生成学习主题和课程..."
                rows={5}
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                写得越详细，生成的课程越精准。AI 会自动从中提取学习主题。
              </p>
            </div>

            {/* 学习目标 */}
            <div className="space-y-2">
              <Label htmlFor="target">学习目标</Label>
              <Textarea
                id="target"
                placeholder="例如：能在技术面试中清晰解释核心机制、能独立完成相关项目..."
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, target_depth: "standard" }))}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    formData.target_depth === "standard"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, target_depth: "deep_dive" }))}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    formData.target_depth === "deep_dive"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                >
                  Deep Learning
                </button>
              </div>
            </div>

            {/* 偏好网络资料来源 */}
            <div className="space-y-2">
              <Label>偏好网络资料来源</Label>
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
                选择你偏好的网络资料来源，AI 会优先参考这些平台
              </p>
            </div>

            {/* 参考资料 */}
            <div className="space-y-3">
              <Label>参考资料</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                上传文件、添加文字笔记或链接，AI 会在生成时参考这些内容
              </p>
              
              {/* 待上传的文件列表 */}
              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePendingFile(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 文字输入区域 */}
              {showTextInput && (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <Textarea
                    placeholder="输入文字笔记、参考链接等..."
                    rows={4}
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowTextInput(false);
                        setTextContent("");
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveTextContent}
                      disabled={!textContent.trim()}
                    >
                      保存
                    </Button>
                  </div>
                </div>
              )}

              {/* 上传按钮 */}
              {!showTextInput && (
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.txt,.md,.doc,.docx,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    上传文件
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowTextInput(true)}
                  >
                    <Plus className="h-4 w-4" />
                    添加文字/链接
                  </Button>
                </div>
              )}
            </div>

            {/* 提交按钮 */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={!formData.description?.trim() || createMutation.isPending}
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
    </>
  );
}
