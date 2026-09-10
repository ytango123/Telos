"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import {
  api,
  BlockCreate,
  BlockUpdate,
  Attachment,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogSurface,
  DialogHeader,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MaterialPicker,
  FileItem,
  TextItem,
  LinkItem,
} from "@/components/blocks/material-picker";
import { SourcePreferences } from "@/components/blocks/source-preferences";
import { cn } from "@/lib/utils";

interface PendingLink {
  url: string;
  kind: "link" | "video";
}

interface BlockFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, edit mode. Otherwise, create mode. */
  blockId?: string;
  onCreated?: (blockId: string) => void;
}

const EMPTY: BlockCreate = {
  title: "新任务",
  description: "",
  target: "",
  target_depth: "standard",
  source_preferences: [],
};

interface ActiveUpload {
  key: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
  file: File;
}

export function BlockFormDialog({
  open,
  onOpenChange,
  blockId,
  onCreated,
}: BlockFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!blockId;

  const { data: existingBlock } = useQuery({
    queryKey: ["block", blockId],
    queryFn: () => api.getBlock(blockId!),
    enabled: isEdit && open,
  });

  const [formData, setFormData] = useState<BlockCreate>(EMPTY);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingNotes, setPendingNotes] = useState<string[]>([]);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [editUploads, setEditUploads] = useState<Record<string, ActiveUpload>>({});
  const [dirty, setDirty] = useState(false);

  // Hydrate when dialog opens
  useEffect(() => {
    if (!open) return;
    if (isEdit && existingBlock) {
      setFormData({
        title: existingBlock.title,
        description: existingBlock.description || "",
        target: existingBlock.target || "",
        target_depth: existingBlock.target_depth,
        source_preferences: existingBlock.source_preferences || [],
      });
    } else if (!isEdit) {
      setFormData(EMPTY);
      setPendingFiles([]);
      setPendingNotes([]);
      setPendingLinks([]);
      setEditUploads({});
    }
    setDirty(false);
  }, [open, isEdit, existingBlock]);

  const markDirty = () => setDirty(true);

  const handleSourcesChange = (next: string[]) => {
    setFormData((prev) => ({ ...prev, source_preferences: next }));
    markDirty();
  };

  /* ---------- Create flow ---------- */
  const createMutation = useMutation({
    mutationFn: async (data: BlockCreate) => {
      const block = await api.createBlock(data);
      const failures: string[] = [];
      for (const f of pendingFiles) {
        try { await api.uploadAttachment(block.id, f); }
        catch { failures.push(`文件「${f.name}」`); }
      }
      for (const n of pendingNotes) {
        try { await api.addNote(block.id, n); }
        catch { failures.push("文本笔记"); }
      }
      for (const l of pendingLinks) {
        try { await api.addLink(block.id, l.url, { kind: l.kind }); }
        catch { failures.push(`链接「${l.url}」`); }
      }
      if (failures.length) throw new Error(`部分资料处理失败：${failures.join("、")}`);
      return block;
    },
    onSuccess: (block) => {
      queryClient.invalidateQueries({ queryKey: ["blocks"] });
      onCreated?.(block.id);
      onOpenChange(false);
    },
  });

  /* ---------- Edit flow ---------- */
  const updateMutation = useMutation({
    mutationFn: (data: BlockUpdate) => api.updateBlock(blockId!, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["block", blockId] });
      await queryClient.invalidateQueries({ queryKey: ["blocks"] });
      onOpenChange(false);
    },
  });

  const performUpload = useCallback(
    (key: string, file: File) => {
      if (!blockId) return;
      setEditUploads((prev) => ({
        ...prev,
        [key]: { key, name: file.name, size: file.size, progress: 0, file },
      }));
      api
        .uploadAttachment(blockId, file, (p) => {
          setEditUploads((prev) =>
            prev[key] ? { ...prev, [key]: { ...prev[key], progress: p } } : prev
          );
        })
        .then(() => {
          setEditUploads((prev) => {
            const c = { ...prev };
            delete c[key];
            return c;
          });
          queryClient.invalidateQueries({ queryKey: ["block", blockId] });
          markDirty();
        })
        .catch((err: Error) => {
          setEditUploads((prev) =>
            prev[key]
              ? { ...prev, [key]: { ...prev[key], error: err.message || "上传失败" } }
              : prev
          );
        });
    },
    [blockId, queryClient]
  );

  const editAddFile = useCallback(
    (file: File) => {
      const key = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      performUpload(key, file);
    },
    [performUpload]
  );

  const editRetryFile = useCallback(
    (key: string) => {
      const u = editUploads[key];
      if (!u?.file) return;
      performUpload(key, u.file);
    },
    [editUploads, performUpload]
  );

  const editAddText = useCallback(
    async (content: string) => {
      if (!blockId) return;
      try {
        await api.addNote(blockId, content);
        queryClient.invalidateQueries({ queryKey: ["block", blockId] });
        markDirty();
      } catch (err) {
        alert(`保存失败：${(err as Error).message}`);
      }
    },
    [blockId, queryClient]
  );

  const editAddLink = useCallback(
    async (url: string, kind: "link" | "video") => {
      if (!blockId) return;
      try {
        await api.addLink(blockId, url, { kind });
        queryClient.invalidateQueries({ queryKey: ["block", blockId] });
        markDirty();
      } catch (err) {
        alert(`添加失败：${(err as Error).message}`);
      }
    },
    [blockId, queryClient]
  );

  const editDeleteAttachment = useCallback(
    async (attId: string) => {
      if (!blockId) return;
      try {
        await api.deleteAttachment(blockId, attId);
        queryClient.invalidateQueries({ queryKey: ["block", blockId] });
        markDirty();
      } catch (err) {
        alert(`删除失败：${(err as Error).message}`);
      }
    },
    [blockId, queryClient]
  );

  /* ---------- Derive picker items ---------- */
  const pickerItems = useMemo(() => {
    const files: FileItem[] = [];
    const texts: TextItem[] = [];
    const links: LinkItem[] = [];

    if (isEdit && existingBlock) {
      for (const att of existingBlock.attachments ?? []) {
        if (att.kind === "file") {
          files.push({
            key: `att-${att.id}`,
            name: att.original_name,
            size: att.file_size,
          });
        } else if (att.kind === "text") {
          texts.push({
            key: `att-${att.id}`,
            preview: att.original_name || "文本笔记",
            chars: att.file_size,
          });
        } else if (att.kind === "link" || att.kind === "video") {
          links.push({
            key: `att-${att.id}`,
            url: att.source_url || att.original_name,
            kind: att.kind,
          });
        }
      }
      // Active in-flight uploads
      for (const u of Object.values(editUploads)) {
        files.push({
          key: `upload-${u.key}`,
          name: u.name,
          size: u.size,
          progress: u.error ? undefined : u.progress,
          error: u.error,
        });
      }
    } else {
      pendingFiles.forEach((f, i) => {
        files.push({ key: `pf-${i}`, name: f.name, size: f.size });
      });
      pendingNotes.forEach((n, i) => {
        const first = n.split("\n")[0].slice(0, 40) || "文本笔记";
        texts.push({ key: `pn-${i}`, preview: first, chars: n.length });
      });
      pendingLinks.forEach((l, i) => {
        links.push({ key: `pl-${i}`, url: l.url, kind: l.kind });
      });
    }
    return { files, texts, links };
  }, [isEdit, existingBlock, editUploads, pendingFiles, pendingNotes, pendingLinks]);

  const onPickerAddFile = (file: File) => {
    if (isEdit) editAddFile(file);
    else {
      setPendingFiles((p) => [...p, file]);
      markDirty();
    }
  };
  const onPickerAddText = (text: string) => {
    if (isEdit) editAddText(text);
    else {
      setPendingNotes((p) => [...p, text]);
      markDirty();
    }
  };
  const onPickerAddLink = (url: string, kind: "link" | "video") => {
    if (isEdit) editAddLink(url, kind);
    else {
      setPendingLinks((p) => [...p, { url, kind }]);
      markDirty();
    }
  };
  const onPickerRemove = (
    kind: "file" | "text" | "link" | "video",
    key: string
  ) => {
    if (isEdit) {
      if (key.startsWith("upload-")) {
        const uploadKey = key.slice("upload-".length);
        setEditUploads((prev) => {
          const c = { ...prev };
          delete c[uploadKey];
          return c;
        });
      } else if (key.startsWith("att-")) {
        editDeleteAttachment(key.slice("att-".length));
      }
    } else {
      if (kind === "file") {
        const idx = Number(key.slice("pf-".length));
        setPendingFiles((p) => p.filter((_, i) => i !== idx));
      } else if (kind === "text") {
        const idx = Number(key.slice("pn-".length));
        setPendingNotes((p) => p.filter((_, i) => i !== idx));
      } else {
        const idx = Number(key.slice("pl-".length));
        setPendingLinks((p) => p.filter((_, i) => i !== idx));
      }
      markDirty();
    }
  };

  const isProcessing = existingBlock?.status === "processing";
  const submitting = createMutation.isPending || updateMutation.isPending;
  const hasActiveUploads = Object.values(editUploads).some(
    (u) => !u.error && u.progress < 100
  );
  const canSubmit =
    !!formData.description?.trim() &&
    !submitting &&
    !hasActiveUploads &&
    (!isEdit || dirty);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (isEdit) updateMutation.mutate(formData);
    else createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogSurface className="w-full max-w-[1080px]">
        <DialogHeader title={isEdit ? "编辑学习任务" : "创建学习任务"} />
        <form onSubmit={onSubmit}>
          <DialogBody className="!overflow-hidden !p-0">
            {isProcessing && (
              <div className="mx-8 mt-6 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-foreground/70" />
                <span className="text-muted-foreground">
                  课程生成中，无法编辑（{existingBlock?.generation_progress ?? 0}%）
                </span>
              </div>
            )}

            <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* LEFT — 学习设定 */}
              <section className="flex flex-col gap-5 px-8 py-8 lg:px-10">
                <Field label="问题详情" required className="flex-1">
                  <Textarea
                    data-autofocus
                    rows={6}
                    placeholder="描述你想学习的内容、问题背景、已有基础…"
                    value={formData.description || ""}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, description: e.target.value }));
                      markDirty();
                    }}
                    disabled={isProcessing}
                    required
                    className="min-h-[140px] resize-none text-[15px] leading-relaxed"
                  />
                </Field>

                <Field label="学习目标">
                  <Textarea
                    rows={5}
                    placeholder="例如：能在面试中清晰解释核心机制"
                    value={formData.target || ""}
                    onChange={(e) => {
                      setFormData((p) => ({ ...p, target: e.target.value }));
                      markDirty();
                    }}
                    disabled={isProcessing}
                    className="min-h-[120px] resize-none text-[15px] leading-relaxed"
                  />
                </Field>

                <Field label="学习深度">
                  <div className="grid grid-cols-2 gap-3">
                    <DepthChoice
                      label="Standard"
                      hint="快速掌握核心概念"
                      active={formData.target_depth === "standard"}
                      disabled={isProcessing}
                      onClick={() => {
                        setFormData((p) => ({ ...p, target_depth: "standard" }));
                        markDirty();
                      }}
                    />
                    <DepthChoice
                      label="Deep Learning"
                      hint="深入原理与延伸"
                      active={formData.target_depth === "deep_dive"}
                      disabled={isProcessing}
                      onClick={() => {
                        setFormData((p) => ({ ...p, target_depth: "deep_dive" }));
                        markDirty();
                      }}
                    />
                  </div>
                </Field>
              </section>

              {/* RIGHT — 资料与来源 */}
              <section className="flex flex-col border-t border-border/50 lg:border-l lg:border-t-0">
                <div className="space-y-5 px-8 py-9 lg:px-10">
                  <div className="space-y-3">
                    <SectionLabel>偏好来源</SectionLabel>
                    <SourcePreferences
                      value={formData.source_preferences || []}
                      onChange={handleSourcesChange}
                      disabled={isProcessing}
                    />
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 px-8 pb-9 pt-7 lg:px-10">
                  <SectionLabel className="mb-4">我的资料</SectionLabel>
                  <MaterialPicker
                    items={pickerItems}
                    onAddFile={onPickerAddFile}
                    onAddText={onPickerAddText}
                    onAddLink={onPickerAddLink}
                    onRemove={onPickerRemove}
                    onRetryFile={isEdit ? editRetryFile : undefined}
                    disabled={isProcessing}
                  />
                </div>
              </section>
            </div>

            {(createMutation.isError || updateMutation.isError) && (
              <p className="px-8 pb-4 text-sm text-destructive">
                {((createMutation.error || updateMutation.error) as Error).message}
              </p>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              className="motion-spring press-tactile gap-1.5"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
              {isEdit ? "保存修改" : "创建任务"}
            </Button>
          </DialogFooter>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium tracking-tight text-foreground">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm font-medium tracking-tight text-foreground/90", className)}>
      {children}
    </p>
  );
}

function DepthChoice({
  label,
  hint,
  active,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "motion-spring press-tactile rounded-xl border px-4 py-3 text-left",
        active
          ? "border-foreground bg-foreground text-background shadow-[var(--shadow-soft-2)]"
          : "border-border/60 bg-card text-foreground hover:border-foreground/25 hover:bg-muted/30",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <span className="block text-sm font-medium tracking-tight">{label}</span>
      <span
        className={cn(
          "mt-1 block text-xs leading-relaxed",
          active ? "text-background/70" : "text-muted-foreground"
        )}
      >
        {hint}
      </span>
    </button>
  );
}
