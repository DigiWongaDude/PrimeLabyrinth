"""Run: python -m unittest test_labyrinth_runtime -v"""
import ast
import random
import unittest
from pathlib import Path
import labyrinth_engine as le
import labyrinth_search as ls
from labyrinth_runtime import LabyrinthSession


class RuntimeTests(unittest.TestCase):
    def test_initial_preview_does_not_visit(self):
        session = LabyrinthSession()
        self.assertEqual(session.neighbourhood(), [(7,(2,2,3)), (11,(3,3,5))])
        self.assertEqual(len(session.visits), 1)
        self.assertEqual(session.room(session.current)['opened'], [None])

    def test_branch_and_merge(self):
        s = LabyrinthSession()
        s.take(1)
        self.assertEqual(s.targets(s.current), [(13,(3,3,7)), (13,(3,5,5))])
        s.take(1)
        s.take(2)
        merge = s.current
        s.reverse()
        s.reverse()
        s.take(2)
        s.take(2)
        self.assertEqual(s.current, merge)
        s.reverse()
        self.assertEqual(s.current, (13,(3,5,5)))

    def test_engine_rows_preserved(self):
        s = LabyrinthSession()
        for p in le.PRIMES:
            if not 7 <= p <= 101:
                continue
            row,nxt = le.build_row(p)
            for h,doors in row:
                self.assertEqual(s.targets((p,h)), [(nxt,d) for d in doors])
        self.assertEqual(
            s.targets((1999, (3, 3, 1993))),
            [(2003, (3, 3, 1997)), (2003, (5, 5, 1993))],
        )

    def test_invalid_door_and_lobby_reverse(self):
        s = LabyrinthSession()
        self.assertFalse(s.reverse())
        for index in (0,-1,2,999):
            self.assertFalse(s.take(index))
        self.assertEqual(s.current, (7,(2,2,3)))
        self.assertEqual(s.path, [])

    def test_against_existing_adventure(self):
        # Execute the actual model functions without importing Pygame/UI.
        wanted = {'get_or_create_room','register_visit','take_door','reverse_step'}
        tree = ast.parse(Path('labyrinth_adventure.py').read_text(encoding='utf-8'))
        funcs = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in wanted]
        ns = dict(le=le, ls=ls, log=lambda _:None, room_state={}, path_stack=[],
                  visit_log={}, visit_order=[], next_visit_id=1, current_visit_id=None)
        exec(compile(ast.Module(body=funcs,type_ignores=[]), '<original adventure>', 'exec'),ns)
        s = LabyrinthSession()
        p,h = s.current
        ns['register_visit'](p,h)
        rng = random.Random(47)
        for _ in range(250):
            state = ns['get_or_create_room'](p,h)
            if rng.random() < .48 or p > 59:
                p,h = ns['reverse_step'](p,h)
                s.reverse()
            else:
                index = rng.randint(0,len(state['doors'])+1)
                p,h = ns['take_door'](p,h,index,state)
                s.take(index)
            self.assertEqual(s.current,(p,h))
            self.assertEqual(s.current_visit, ns['current_visit_id'])
            self.assertEqual(s.visits, ns['visit_log'])
            self.assertEqual(s.path,[f['visit_id'] for f in ns['path_stack']])
            for key,value in ns['room_state'].items():
                self.assertEqual(s.room(key),value)


if __name__ == '__main__':
    unittest.main()
