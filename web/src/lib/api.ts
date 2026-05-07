const API_BASE = "";

export interface Block {
  id: string;
  title: string;
  description: string | null;
  target: string | null;
  target_depth: "quick_overview" | "standard" | "deep_dive";
  source_preferences: string[];
  status: "draft" | "processing" | "completed" | "failed";
  generation_progress: number;
  status_message: string | null;
  course_id: string | null;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  file_path: string;
  created_at: string;
}

export interface BlockCreate {
  title: string;
  description?: string;
  target?: string;
  target_depth?: "quick_overview" | "standard" | "deep_dive";
  source_preferences?: string[];
}

export interface BlockUpdate {
  title?: string;
  description?: string;
  target?: string;
  target_depth?: "quick_overview" | "standard" | "deep_dive";
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

class ApiClient {
  private async fetch<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

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
  async getBlocks(params?: { skip?: number; limit?: number; status?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.skip) searchParams.set("skip", String(params.skip));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.status) searchParams.set("status", params.status);
    
    const query = searchParams.toString();
    return this.fetch<{ blocks: Block[]; total: number }>(
      `/api/blocks${query ? `?${query}` : ""}`
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
}

export const api = new ApiClient();
