"""Graphics-independent adventure state. Mathematics stays in labyrinth_engine.

Visit links and reverse semantics follow labyrinth_adventure, including shared
opened-door links for converging paths. Geometry must never determine adjacency.
"""
import labyrinth_engine as le
from labyrinth_search import DEFAULT_START_P, DEFAULT_START_H


class LabyrinthSession:
    def __init__(self):
        self.rooms = {}
        self.visits = {}
        self.path = []
        self.current_visit = self._visit(DEFAULT_START_P, DEFAULT_START_H, None)
        self.room(self.current)

    @property
    def current(self):
        v = self.visits[self.current_visit]
        return v['p'], v['h']

    def _visit(self, p, h, parent):
        vid = len(self.visits) + 1
        self.visits[vid] = dict(id=vid, p=p, h=h, parent=parent)
        return vid

    def room(self, key):
        if key not in self.rooms:
            p, h = key
            row, nxt = le.build_row(p)
            doors = next((ds for rh, ds in row if rh == h), None)
            # Matches the adventure at invalid/terminal row identities.
            self.rooms[key] = dict(doors=list(doors or []),
                                   opened=[None] * len(doors or []),
                                   nxt=nxt if doors is not None else None)
        return self.rooms[key]

    def targets(self, key):
        state = self.room(key)
        return [(state['nxt'], h) for h in state['doors']]

    def take(self, index):
        state = self.room(self.current)
        if not 1 <= index <= len(state['doors']):
            return False
        child = state['opened'][index - 1]
        if child is None and state['nxt'] is None:
            return False
        self.path.append(self.current_visit)
        if child is None:
            child = self._visit(state['nxt'], state['doors'][index - 1],
                                self.current_visit)
            state['opened'][index - 1] = child
        self.current_visit = child
        self.room(self.current)
        return True

    def reverse(self):
        if not self.path:
            return False
        self.current_visit = self.path.pop()
        return True

    def neighbourhood(self):
        """One hop only; previewing rooms does not visit or open them."""
        keys = [self.current] + self.targets(self.current)
        for key in keys:
            self.room(key)
        return keys
