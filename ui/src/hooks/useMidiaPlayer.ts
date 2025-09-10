// src/hooks/useMidiaPlayer.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlayerAPI, type QueueItem, type StatusResponse, type SearchResponse } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

type UseMidiaPlayer = {
  isLoading: boolean;
  isPlaying: boolean;
  volume: number;
  queue: QueueItem[];
  current?: StatusResponse["current_track"] | null;

  refresh: () => Promise<void>;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  setVolume: (v: number) => void;

  addById: (id: string) => Promise<void>;
  searchYouTube: (q: string, limit?: number) => Promise<SearchResponse>;
  playYouTube: (video_id: string) => Promise<void>;
};

export function useMidiaPlayer(limit: number = 5): UseMidiaPlayer {
  const [isLoading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(50);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [current, setCurrent] = useState<StatusResponse["current_track"] | null>(null);

  // debounce para volume
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const sendVolume = useCallback((v: number) => PlayerAPI.setVolume(v).catch(() => {}), []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sendVolume(v), 150);
  }, [sendVolume]);

  const loadStatus = useCallback(async () => {
    const s = await PlayerAPI.getStatus();
    setIsPlaying(Boolean(s.is_playing));
    setVolumeState(s.volume ?? 50);
    setCurrent(s.current_track ?? null);
  }, []);

  const loadQueue = useCallback(async () => {
    const q = await PlayerAPI.getQueue(limit);
    setQueue(q.queue ?? []);
  }, [limit]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadStatus(), loadQueue()]);
    } finally {
      setLoading(false);
    }
  }, [loadStatus, loadQueue]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const togglePlay = useCallback(async () => {
    try {
      await PlayerAPI.togglePlay();
      // otimismo: inverte localmente
      setIsPlaying((p) => !p);
    } catch {
      toast({ title: "Erro", description: "Não foi possível alternar o player", variant: "destructive" });
    }
  }, []);

  const nextTrack = useCallback(async () => {
    try {
      await PlayerAPI.nextTrack();
      await refresh();
    } catch {
      toast({ title: "Erro", description: "Não foi possível avançar", variant: "destructive" });
    }
  }, [refresh]);

  const prevTrack = useCallback(async () => {
    try {
      await PlayerAPI.prevTrack();
      await refresh();
    } catch {
      toast({ title: "Erro", description: "Não foi possível voltar", variant: "destructive" });
    }
  }, [refresh]);

  const addById = useCallback(async (id: string) => {
    try {
      await PlayerAPI.addToQueue({ id });
      await loadQueue();
    } catch {
      toast({ title: "Erro", description: "Não foi possível adicionar à fila", variant: "destructive" });
    }
  }, [loadQueue]);

  const searchYouTube = useCallback(async (q: string, limit?: number) => {
    return PlayerAPI.searchYouTube({ query: q, limit });
  }, []);

  const playYouTube = useCallback(async (video_id: string) => {
    try {
      await PlayerAPI.playYouTube({ video_id });
      await refresh();
    } catch {
      toast({ title: "Erro", description: "Não foi possível tocar do YouTube", variant: "destructive" });
    }
  }, [refresh]);

  return useMemo(() => ({
    isLoading,
    isPlaying,
    volume,
    queue,
    current,
    refresh,
    togglePlay,
    nextTrack,
    prevTrack,
    setVolume,
    addById,
    searchYouTube,
    playYouTube,
  }), [
    isLoading, isPlaying, volume, queue, current,
    refresh, togglePlay, nextTrack, prevTrack, setVolume, addById, searchYouTube, playYouTube
  ]);
}
