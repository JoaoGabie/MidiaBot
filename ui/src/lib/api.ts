// src/lib/api.ts
import { toast } from "@/hooks/use-toast";

interface ApiError {
  detail: string;
}

interface ApiResponse<T> {
  ok: boolean;
  status: number;
  body: T | string | null;
  headers?: Record<string, string>;
  stack?: string;
}

interface YouTubeResult {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
}

export interface QueueItem {
  id: string;
  title: string;
  requested_by?: string;
  is_playing: boolean;
}

interface CurrentTrack {
  id?: string;
  title?: string;
  requested_by?: string;
  source?: "yt" | "file" | string;
}

export interface StatusResponse {
  is_playing: boolean;
  volume: number;
  current_track?: CurrentTrack | null;
}

interface QueueResponse {
  queue: QueueItem[];
}

interface VolumeResponse {
  ok: boolean;
  volume: number;
}

export interface SearchResponse {
  ok: boolean;
  results?: YouTubeResult[];
  error?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const isElectron =
    typeof window !== "undefined" && typeof window.electronAPI !== "undefined";

  try {
    let response: ApiResponse<T>;

    if (isElectron && window.electronAPI) {
      // chamada via Electron preload
      response = await window.electronAPI.fetch(path, init);
    } else {
      // chamada via fetch normal (Next.js/Browser)
      const fetchResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"}${path}`,
        {
          ...init,
          headers: {
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...init?.headers,
          },
        }
      );

      const text = await fetchResponse.text();
      let body: T | string | null = null;
      try {
        body = text ? (JSON.parse(text) as T) : null;
      } catch {
        body = text;
      }

      response = {
        ok: fetchResponse.ok,
        status: fetchResponse.status,
        body,
        headers: Object.fromEntries(fetchResponse.headers.entries()),
      };
    }

    if (!response.ok) {
      throw new Error(
        (response.body as string) || `${response.status} API Error`
      );
    }

    return response.body as T;
  } catch (error: any) {
    console.error(`API error at ${path}:`, error);
    toast({
      title: "Erro na API",
      description:
        error.message || "Não foi possível conectar ao servidor",
      variant: "destructive",
    });
    throw error;
  }
}

export const PlayerAPI = {
  getStatus: () => api<StatusResponse>("/status"),
  getQueue: (limit: number = 5) => api<QueueResponse>(`/queue?limit=${limit}`),
  togglePlay: () => api<{ ok: true }>("/play", { method: "POST" }),
  nextTrack: () => api<{ ok: true }>("/next", { method: "POST" }),
  prevTrack: () => api<{ ok: true }>("/prev", { method: "POST" }),
  setVolume: (value: number) =>
    api<VolumeResponse>(`/volume?value=${value}`),
  addToQueue: (data: { id: string }) =>
    api<{ ok: true }>("/queue/by-id", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  searchYouTube: (data: { query: string; limit?: number }) =>
    api<SearchResponse>("/yt/search", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  playYouTube: (data: { video_id: string }) =>
    api<{ ok: true }>("/yt/play", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
