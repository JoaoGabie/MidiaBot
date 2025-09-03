import os, re, subprocess
from typing import Optional

from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel

from player import player
from track_queue import queue, Track  # usa teu track_queue.py local
from library import (
    rescan as lib_rescan,
    search as lib_search,
    get_path_by_id,
    import_file,
    update_label,
)

app = FastAPI(title="Midia Orchestrator")

def is_url(s: str) -> bool:
    return re.match(r'https?://', s or '') is not None


from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173","http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
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

@app.post("/volume")
def set_volume(value: int = Query(..., ge=0, le=100)):
    player.volume(value)
    return {"ok": True, "volume": value}

@app.get("/queue")
def list_queue():
    return {"ok": True, "playlist": player.playlist()}

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
