from fastapi import FastAPI, Query
from pydantic import BaseModel
import asyncio, subprocess, json, re
from typing import Optional
from player import player
from queue import queue, Track

app = FastAPI(title = "Midia Orchestrator")

YTDLP = ["yt-dlp", "-x", "--audio-format", "mp3", "--no-playlist", "-o", "%(title)s.%(ext)s"]

class EnqueueReq(BaseModel):
    query: str
    requested_by: str

def is_url(s:str) -> bool:
    return re.match(r'https?://', s) is not None

async def download_audio(url: str) -> str:
    # baixa mp3 na pasta atual e retorna nome do arquivo
    proc = await asyncio.create_subprocess_exec(*YTDLP, url,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    # yt-dlp escreve o nome no stdout; forma simples de capturar o último arquivo criado
    # para robustez, poderias usar --print filename
    return out.decode(errors="ignore").splitlines()[-1] if out else url

@app.post("/queue")
async def enqueue(req: EnqueueReq):
    q = req.query.strip()
    if is_url(q):
        # stream direto
        player.load(q, append=True)
        return {"ok": True, "title": q}
    # texto não toca aqui (força confirmação no bot)
    return {"ok": False, "error": "confirmacao_required"}
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

@app.post("/queue/clear")
def clear_queue():
    queue.clear()
    return {"ok": True}

class YTSearchReq(BaseModel):
    query: str
    limit: int = 5

@app.post("/yt/search")
def yt_search(req: YTSearchReq):
    cmd = [
        "yt-dlp", f"ytsearch{req.limit}:{req.query}",
        "--skip-download",
        "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration_string)s"
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return {"ok": False, "results": []}
    results = []
    for line in r.stdout.strip().splitlines():
        vid, title, channel, dur = (line.split("\t")+[""]*4)[:4]
        results.append({
            "video_id": vid,
            "title": title, "channel": channel, "duration": dur,
            "url": f"https://www.youtube.com/watch?v={vid}"
        })
    return {"ok": True, "results": results}

class PlayYoutubeReq(BaseModel):
    video_id: str

@app.post("/yt/play")
def yt_play(req: PlayYoutubeReq):
    url = f"https://www.youtube.com/watch?v={req.video_id}"
    player.load(url, append=True)  # stream
    return {"ok": True}

# executa: uvicorn main:app --host 127.0.0.1 --port 8000 --reload
