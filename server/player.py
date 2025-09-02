from mpv import MPV
import threading

class Player:
     def __init__(self):
         self.mpv = MPV(
            audio_client_name = 'MidiaBot',
             idle=True,
             log_handler=None
         )
         self.lock = threading.Lock()

     def load(self, path_or_url, append=True):
         with self.lock:
             if append:
                 self.mpv.command('loadfile', path_or_url, 'append-play')
             else:
                 self.mpv.command('loadfile', path_or_url, 'replace')

     def play_pause(self):
         with self.lock:
             self.mpv.pause = not self.mpv.pause

     def stop(self):
         with self.lock:
             self.mpv.command('stop')

     def next(self):
         with self.lock:
             self.mpv.command('playlist-next', 'force')

     def prev(self):
         with self.lock:
             self.mpv.command('playlist-prev', 'force')

     def volume(self, volume: int):
         with self.lock:
             self.mpv.volume = max(0, min(volume, 100))

     def playlist(self):
         pls = self.mpv.playlists
         out = []
         for i, item in enumerate(pls):
             out.append({
                 "index": i,
                 "current": (i == self.mpv.playlist_pos),
                 "filename": item['filename']
             })
         return out

player = Player()