import os, sys

from mpv import MPV
import threading

dll_dir = r"C:\Tools\mpv"
os.environ["PATH"] = dll_dir + os.pathsep + os.environ.get("PATH", "")
sys.path.append(dll_dir)  # força o Python a olhar na pasta

class Player:
    def __init__(self):
        self.mpv = MPV(
            audio_client_name='MidiaBot',
            idle=True,
            log_handler=None
        )
        self.lock = threading.Lock()

    def load(self, path_or_url: str, append: bool = True):
        with self.lock:
            self.mpv.command('loadfile', path_or_url, 'append-play' if append else 'replace')

    def play_pause(self):
        with self.lock:
            current = bool(getattr(self.mpv, 'pause', False))
            self.mpv.pause = not current

    def stop(self):
        with self.lock:
            self.mpv.command('stop')

    def next(self):
        with self.lock:
            self.mpv.command('playlist-next', 'force')

    def prev(self):
        with self.lock:
            self.mpv.command('playlist-prev', 'force')

    def volume(self, value: int):
        with self.lock:
            self.mpv.volume = max(0, min(100, int(value)))

    def playlist(self):
        with self.lock:
            pls = list(self.mpv.playlist or [])
            pos = getattr(self.mpv, 'playlist_pos', -1)
            out = []
            for i, item in enumerate(pls):
                fn = item.get('filename') if isinstance(item, dict) else str(item)
                out.append({"index": i, "current": (i == pos), "filename": fn})
            return out

player = Player()
