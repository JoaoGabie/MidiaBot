import os, re, subprocess
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from player import player
from track_queue import queue, Track
from library import (
    rescan as lib_rescan,
    search as lib_search,
    get_path_by_id,
    import_file,
    update_label,
)

app = FastAPI(title="Midia Orchestrator")

# CORS (uma única vez)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # simples para dev/Electron
    allow_credentials=False,  # se True, NÃO pode usar "*"
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)

# Utils
def is_url(s: str) -> bool:
    return re.match(r'https?://', s or '') is not None

# =========================
# Models para Status/Queue
# =========================
class CurrentTrack(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    requested_by: Optional[str] = None
    source: Optional[str] = None  # "yt" | "file" | etc.

class StatusResponse(BaseModel):
    is_playing: bool
    volume: int
    current_track: Optional[CurrentTrack] = None

class QueueItem(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    requested_by: Optional[str] = None
    is_playing: bool = False

class QueueResponse(BaseModel):
    queue: List[QueueItem]

def _safe_get_volume() -> int:
    try:
        vol = player.mpv.get_property('volume')  # type: ignore[attr-defined]
        return int(round(float(vol or 50)))
    except Exception:
        return 50

def _safe_get_is_playing() -> bool:
    try:
        pause = player.mpv.get_property('pause')  # True = pausado
        return not bool(pause)
    except Exception:
        return False

def _safe_get_current() -> Optional[CurrentTrack]:
    try:
        title = player.mpv.get_property('media-title')
    except Exception:
        title = None
    cur = getattr(player, "current", None)
    if isinstance(cur, dict):
        return CurrentTrack(
            id=cur.get("id"),
            title=cur.get("title") or title,
            requested_by=cur.get("requested_by"),
            source=cur.get("source"),
        )
    if title:
        return CurrentTrack(title=title)
    return None

def _safe_get_queue(limit: int) -> List[QueueItem]:
    q: List[QueueItem] = []
    # Tenta fila própria do player (se você já preenche player.queue)
    if hasattr(player, "queue") and isinstance(player.queue, list):  # type: ignore[attr-defined]
        for it in player.queue[:limit]:  # type: ignore[index]
            q.append(QueueItem(
                id=it.get("id"),
                title=it.get("title"),
                requested_by=it.get("requested_by"),
                is_playing=bool(it.get("is_playing", False)),
            ))
        return q
    # Fallback: playlist do mpv
    try:
        playlist: list[Dict[str, Any]] = player.mpv.get_property('playlist')  # type: ignore[attr-defined]
        for entry in (playlist or [])[:limit]:
            title = entry.get("title") or entry.get("filename")
            q.append(QueueItem(
                id=str(entry.get("id")) if entry.get("id") is not None else None,
                title=title,
                is_playing=bool(entry.get("current", False)),
            ))
        return q
    except Exception:
        return []

# =========================
# Playback (stream / control)
# =========================
class EnqueueReq(BaseModel):
    query: str
    requested_by: Optional[str] = None

@app.post("/queue")
def enqueue(req: EnqueueReq):
    q = (req.query or "").strip()
    if not q:
        raise HTTPException(400, "query vazia")
    if not is_url(q):
        # Front pede confirmação quando não for URL (ex.: busca por texto)
        return {"ok": False, "error": "confirmacao_required"}
    player.load(q, append=True)
    return {"ok": True, "title": q}

@app.post("/play")
def play_pause():
    player.play_pause()
    return {"ok": True}

@app.post("/next")
def next_track():
    player.next()
    return {"ok": True}

@app.post("/prev")
def prev_track():
    player.prev()
    return {"ok": True}

# Mantém POST /volume para compatibilidade
@app.post("/volume")
def set_volume_post(value: int = Query(..., ge=0, le=100)):
    player.volume(value)
    return {"ok": True, "volume": value}

# =========================
# YouTube search / play
# =========================
class YTSearchReq(BaseModel):
    query: str
    limit: int = 5

@app.post("/yt/search")
def yt_search(req: YTSearchReq):
    cmd = [
        "yt-dlp",
        f"ytsearch{req.limit}:{req.query}",
        "--skip-download",
        "--print",
        "%(id)s\t%(title)s\t%(channel)s\t%(duration_string)s",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return {"ok": False, "results": []}
    results = []
    for line in r.stdout.strip().splitlines():
        vid, title, channel, dur = (line.split("\t") + [""] * 4)[:4]
        results.append({
            "video_id": vid,
            "title": title,
            "channel": channel,
            "duration": dur or "",
            "url": f"https://www.youtube.com/watch?v={vid}",
        })
    return {"ok": True, "results": results}

class PlayYoutubeReq(BaseModel):
    video_id: str

@app.post("/yt/play")
def yt_play(req: PlayYoutubeReq):
    url = f"https://www.youtube.com/watch?v={req.video_id}"
    player.load(url, append=True)
    return {"ok": True}

# =========================
# Biblioteca local
# =========================
@app.post("/library/rescan")
def library_rescan():
    lib_rescan()
    return {"ok": True}

class SearchReq(BaseModel):
    query: str
    limit: int = 10

@app.post("/library/search")
def library_search(req: SearchReq):
    rows = lib_search(req.query, req.limit)
    out = [{"db_id": r[0], "code": r[1], "title": r[2], "folder": r[4]} for r in rows]
    return {"ok": True, "results": out}

class EnqueueIdReq(BaseModel):
    db_id: int

@app.post("/queue/by-id")
def enqueue_by_id(req: EnqueueIdReq):
    p = get_path_by_id(req.db_id)
    if not p:
        raise HTTPException(404, "ID não encontrado")
    player.load(p, append=True)
    return {"ok": True}

class ImportReq(BaseModel):
    id: str
    file: str
    label: Optional[str] = None

@app.post("/library/import")
def library_import(req: ImportReq):
    if not os.path.exists(req.file):
        raise HTTPException(400, "Arquivo não existe no disco")
    import_file(req.id, req.file, req.label)
    return {"ok": True}

@app.post("/library/label")
def library_label(code: str, label: str):
    update_label(code, label)
    return {"ok": True}

# =========================
# Novos endpoints de Status/Queue/Volume (GET)
# =========================
@app.get("/status", response_model=StatusResponse)
def get_status():
    return StatusResponse(
        is_playing=_safe_get_is_playing(),
        volume=_safe_get_volume(),
        current_track=_safe_get_current(),
    )

@app.get("/queue", response_model=QueueResponse)
def get_queue(limit: int = 5):
    items = _safe_get_queue(limit)
    return QueueResponse(queue=items)

@app.get("/volume")
def set_volume_get(value: int = Query(..., ge=0, le=100)):
    player.volume(value)
    return {"ok": True, "volume": value}
