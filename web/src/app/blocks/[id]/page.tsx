"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles, BookOpen, Upload, X, FileText, Link as LinkIcon, Plus } from "lucide-react";
import { api, BlockUpdate, Attachment } from "@/lib/api";
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

export default function EditBlockPage() {
  const router = useRouter();
  const params = useParams();
  const blockId = params.id as string;
  const queryClient = useQueryClient();

  const { data: block, isLoading, error } = useQuery({
    queryKey: ["block", blockId],
    queryFn: () => api.getBlock(blockId),
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 2000 : false,
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
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());
  const [textContent, setTextContent] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["block", blockId] });
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
      setHasChanges(false);
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

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    for (const file of Array.from(files)) {
      const fileId = `${file.name}-${Date.now()}`;
      setUploadingFiles((prev) => new Map(prev).set(fileId, 0));
      
      try {
        await api.uploadAttachment(blockId, file, (progress) => {
          setUploadingFiles((prev) => new Map(prev).set(fileId, progress));
        });
        queryClient.invalidateQueries({ queryKey: ["block", blockId] });
        setHasChanges(true);
      } catch (err) {
        alert(`上传失败: ${(err as Error).message}`);
      } finally {
        setUploadingFiles((prev) => {
          const next = new Map(prev);
          next.delete(fileId);
          return next;
        });
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [blockId, queryClient]);

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!confirm("确定删除此附件？")) return;
    try {
      await api.deleteAttachment(blockId, attachmentId);
      queryClient.invalidateQueries({ queryKey: ["block", blockId] });
      setHasChanges(true);
    } catch (err) {
      alert(`删除失败: ${(err as Error).message}`);
    }
  };

  const handleSaveTextContent = async () => {
    if (!textContent.trim()) return;
    const blob = new Blob([textContent], { type: "text/plain" });
    const file = new File([blob], `note-${Date.now()}.txt`, { type: "text/plain" });
    await handleFileSelect([file] as unknown as FileList);
    setTextContent("");
    setShowTextInput(false);
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
              <Label htmlFor="description">
                问题详情 <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="描述你想学习的内容、问题背景、已有基础等..."
                value={formData.description || ""}
                onChange={(e) => handleChange("description", e.target.value)}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                写得越详细，生成的课程越精准。AI 会自动从中提取学习主题。
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target">学习目标</Label>
              <Textarea
                id="target"
                rows={2}
                placeholder="例如：能在技术面试中清晰解释核心机制、能独立完成相关项目..."
                value={formData.target || ""}
                onChange={(e) => handleChange("target", e.target.value)}
                disabled={isProcessing}
              />
              <p className="text-xs text-muted-foreground">
                明确的目标有助于 AI 生成更精准的内容
              </p>
            </div>

            <div className="space-y-2">
              <Label>学习深度</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => !isProcessing && handleChange("target_depth", "standard")}
                  disabled={isProcessing}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    formData.target_depth === "standard"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => !isProcessing && handleChange("target_depth", "deep_dive")}
                  disabled={isProcessing}
                  className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                    formData.target_depth === "deep_dive"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Deep Learning
                </button>
              </div>
            </div>

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
                    className={`cursor-pointer ${isProcessing ? "opacity-50 pointer-events-none" : ""}`}
                    onClick={() => !isProcessing && toggleSource(source.id)}
                  >
                    {source.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 附件上传区域 */}
            <div className="space-y-3">
              <Label>参考资料</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                上传文件、添加文字笔记或链接，AI 会在生成时参考这些内容
              </p>
              
              {/* 已上传的附件列表 */}
              {block.attachments && block.attachments.length > 0 && (
                <div className="space-y-2">
                  {block.attachments.map((att: Attachment) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-sm">{att.original_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(att.file_size / 1024).toFixed(1)} KB
                      </span>
                      {!isProcessing && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 上传中的文件 */}
              {uploadingFiles.size > 0 && (
                <div className="space-y-2">
                  {Array.from(uploadingFiles.entries()).map(([fileId, progress]) => (
                    <div
                      key={fileId}
                      className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                      <span className="flex-1 truncate text-sm">
                        {fileId.split("-")[0]}
                      </span>
                      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-200"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8">
                        {progress}%
                      </span>
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
              {!isProcessing && !showTextInput && (
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

            {/* 操作按钮 */}
            {!isProcessing && !isCompleted && (
              <div className="flex gap-4 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={!hasChanges || updateMutation.isPending}
                  className="flex-1"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  保存修改
                </Button>
              </div>
            )}

            {updateMutation.isError && (
              <p className="text-sm text-destructive">
                操作失败：{(updateMutation.error as Error).message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
