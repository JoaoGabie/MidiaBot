# server/library.py
import os, sqlite3, re
from pathlib import Path
from rapidfuzz import process, fuzz

LIB_ROOT = os.environ.get("LIB_ROOT", r"D:\Playbacks")  # ajuste no Windows
DB_PATH = Path(__file__).with_name("library.db")
AUDIO_EXTS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"}

def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY,
        code TEXT,
        title TEXT,
        path TEXT UNIQUE,
        folder TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tracks_code ON tracks(code)")
    return conn

def parse_filename(name: str):
    m = re.match(r'^\s*(\d{1,4})\s*[-_]\s*(.+)$', name)
    if m: return m.group(1).zfill(3), m.group(2)
    return None, name

def rescan():
    root = Path(LIB_ROOT)
    if not root.exists():
        raise RuntimeError(f"Pasta da biblioteca não existe: {root}")
    conn = connect(); cur = conn.cursor(); seen = set()

    for r, _, files in os.walk(root):
        for f in files:
            p = Path(r) / f
            if p.suffix.lower() not in AUDIO_EXTS:
                continue
            code, title = parse_filename(p.stem)
            folder = Path(r).relative_to(root).parts[0] if Path(r) != root else ""
            cur.execute("INSERT OR IGNORE INTO tracks(code,title,path,folder) VALUES (?,?,?,?)",
                        (code, title, str(p.resolve()), folder))
            seen.add(str(p.resolve()))

    cur.execute("SELECT path FROM tracks")
    for (path,) in cur.fetchall():
        if not os.path.exists(path):
            cur.execute("DELETE FROM tracks WHERE path = ?", (path,))
    conn.commit(); conn.close()

def list_all():
    conn = connect()
    rows = conn.execute("SELECT id, code, title, path, folder FROM tracks ORDER BY code, title").fetchall()
    conn.close(); return rows

def search(query: str, limit=10):
    conn = connect()
    rows = conn.execute("SELECT id, COALESCE(code,''), title, path, folder FROM tracks").fetchall()
    conn.close()

    q = query.strip()
    if re.match(r'^#?\d{1,4}$', q) or re.match(r'^[A-Za-z]\d{3,}$', q):
        code = q[1:] if q.startswith('#') else q
        if code.isdigit(): code = code.zfill(3)
        for r in rows:
            if r[1] == code:
                return [r]

    choices = {i: f"{code} {title}".strip() for (i, code, title, _, _) in rows}
    scored = process.extract(q, choices, scorer=fuzz.WRatio, limit=limit)
    id_map = {r[0]: r for r in rows}
    result = []
    for (rowid, _, _score, _) in scored:
        result.append(id_map[rowid])
    return result

def get_path_by_id(db_id: int):
    conn = connect()
    row = conn.execute("SELECT path FROM tracks WHERE id = ?", (db_id,)).fetchone()
    conn.close()
    return row[0] if row else None

def import_file(id_code: str, filepath: str, label: str | None):
    p = Path(filepath)
    if p.suffix.lower() not in AUDIO_EXTS:
        raise RuntimeError("Apenas arquivos de áudio são aceitos.")
    conn = connect()
    title = label or p.stem
    folder = "Uploads"
    conn.execute("INSERT OR IGNORE INTO tracks(code,title,path,folder) VALUES (?,?,?,?)",
                 (id_code, title, str(p.resolve()), folder))
    conn.commit(); conn.close()

def update_label(code: str, new_title: str):
    conn = connect()
    conn.execute("UPDATE tracks SET title=? WHERE code=?", (new_title, code))
    conn.commit(); conn.close()
