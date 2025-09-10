export type QueueItem = {
  id: string
  title: string
  user?: string
  isPlaying?: boolean
}

export type StatusResponse = {
  is_playing: boolean
  volume: number
  current_track?: { id?: string; title?: string; requested_by?: string }
}
