from dataclasses import dataclass, field
from typing import List

@dataclass
class Track:
    title: str
    source: str  # url ou arquivo
    requested_by: str

@dataclass
class Queue:
    items: List[Track] = field(default_factory=list)

    def add(self, t: Track):
        self.items.append(t)

    def pop(self):
        return self.items.pop(0) if self.items else None

    def clear(self):
        self.items.clear()

queue = Queue()
