const API_BASE = "";

/** Merge query cancellation with a timeout controller so either can abort fetch. */
function mergeAbortSignals(
  userSignal: AbortSignal | null | undefined,
  timeoutSignal: AbortSignal
): AbortSignal {
  if (!userSignal) return timeoutSignal;
  const merged = new AbortController();
  const forward = () => {
    if (!merged.signal.aborted) merged.abort();
  };
  if (userSignal.aborted || timeoutSignal.aborted) {
    forward();
    return merged.signal;
  }
  userSignal.addEventListener("abort", forward, { once: true });
  timeoutSignal.addEventListener("abort", forward, { once: true });
  return merged.signal;
}

export interface Block {
  id: string;
  title: string;
  description: string | null;
  target: string | null;
  target_depth: "standard" | "deep_dive";
  source_preferences: string[];
  status: "draft" | "processing" | "completed" | "failed";
  generation_progress: number;
  status_message: string | null;
  generation_debug: Record<string, unknown>;
  course_id: string | null;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
}

export type AttachmentKind = "file" | "text" | "link" | "video";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  source_url: string | null;
  created_at: string;
}

export interface BlockCreate {
  title: string;
  description?: string;
  target?: string;
  target_depth?: "standard" | "deep_dive";
  source_preferences?: string[];
}

export interface BlockUpdate {
  title?: string;
  description?: string;
  target?: string;
  target_depth?: "standard" | "deep_dive";
  source_preferences?: string[];
}

export interface Chapter {
  id: string;
  course_id: string;
  order: number;
  title: string;
  content: string | null;
  content_blocks: Record<string, unknown>[];
  created_at: string;
}

export interface Course {
  id: string;
  block_id: string;
  title: string;
  description: string | null;
  course_metadata: Record<string, unknown>;
  chapters: Chapter[];
  created_at: string;
}

export interface GenerationStatus {
  block_id: string;
  status: string;
  progress: number;
  course_id: string | null;
  message: string | null;
}

type ApiFetchInit = RequestInit & { timeoutMs?: number };

class ApiClient {
  private async fetch<T>(endpoint: string, options?: ApiFetchInit): Promise<T> {
    const { timeoutMs = 120_000, signal: userSignal, ...rest } = options ?? {};
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = mergeAbortSignals(userSignal, timeoutController.signal);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...rest,
        signal,
        headers: {
          "Content-Type": "application/json",
          ...rest.headers,
        },
      });
    } catch (e: unknown) {
      const isAbort =
        (typeof DOMException !== "undefined" &&
          e instanceof DOMException &&
          e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      if (isAbort) {
        throw new Error(
          "请求超时或已中断。若页面长时间转圈，请确认后端已在 http://127.0.0.1:8000 运行（终端里 uvicorn 未被关掉或频繁 reload）。"
        );
      }
      if (e instanceof TypeError) {
        throw new Error(
          "无法连接 API（网络或代理失败）。请确认 FastAPI 在 8000 端口运行后再刷新。"
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `API Error: ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Health check
  async healthCheck() {
    return this.fetch<{ status: string; service: string; version: string }>(
      "/health"
    );
  }

  // Blocks
  async getBlocks(
    params?: { skip?: number; limit?: number; status?: string },
    init?: Pick<RequestInit, "signal">
  ) {
    const searchParams = new URLSearchParams();
    if (params?.skip) searchParams.set("skip", String(params.skip));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    
    const query = searchParams.toString();
    return this.fetch<{ blocks: Block[]; total: number }>(
      `/api/blocks${query ? `?${query}` : ""}`,
      { ...init, timeoutMs: 10_000 }
    );
  }

  async getBlock(id: string) {
    return this.fetch<Block>(`/api/blocks/${id}`);
  }

  async createBlock(data: BlockCreate) {
    return this.fetch<Block>("/api/blocks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBlock(id: string, data: BlockUpdate) {
    return this.fetch<Block>(`/api/blocks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteBlock(id: string) {
    return this.fetch<void>(`/api/blocks/${id}`, {
      method: "DELETE",
    });
  }

  async generateCourse(blockId: string) {
    return this.fetch<GenerationStatus>(`/api/blocks/${blockId}/generate`, {
      method: "POST",
    });
  }

  async cancelGeneration(blockId: string) {
    return this.fetch<{ ok: boolean; message: string }>(
      `/api/blocks/${blockId}/cancel-generation`,
      { method: "POST" }
    );
  }

  async getGenerationStatus(blockId: string) {
    return this.fetch<GenerationStatus>(`/api/blocks/${blockId}/status`);
  }

  // Courses
  async getCourses(params?: { skip?: number; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.skip) searchParams.set("skip", String(params.skip));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    
    const query = searchParams.toString();
    return this.fetch<{ courses: Course[]; total: number }>(
      `/api/courses${query ? `?${query}` : ""}`
    );
  }

  async getCourse(id: string) {
    return this.fetch<Course>(`/api/courses/${id}`);
  }

  async deleteCourse(id: string) {
    return this.fetch<void>(`/api/courses/${id}`, {
      method: "DELETE",
    });
  }

  // Attachments
  async uploadAttachment(
    blockId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<Attachment> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append("file", file);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `Upload failed: ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed: network error"));
      });

      xhr.open("POST", `/api/blocks/${blockId}/attachments`);
      xhr.send(formData);
    });
  }

  async addNote(blockId: string, content: string): Promise<Attachment> {
    return this.fetch<Attachment>(`/api/blocks/${blockId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async addLink(
    blockId: string,
    url: string,
    options?: { title?: string; kind?: "link" | "video" }
  ): Promise<Attachment> {
    return this.fetch<Attachment>(`/api/blocks/${blockId}/links`, {
      method: "POST",
      body: JSON.stringify({
        url,
        title: options?.title,
        kind: options?.kind ?? "link",
      }),
    });
  }

  async deleteAttachment(blockId: string, attachmentId: string) {
    return this.fetch<void>(
      `/api/blocks/${blockId}/attachments/${attachmentId}`,
      { method: "DELETE" }
    );
  }
}

export const api = new ApiClient();
