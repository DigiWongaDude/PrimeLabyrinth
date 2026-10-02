"""Run with Blender's Text Editor, or import and call start().

Only the dedicated generated collection is rebuilt. The original scene is kept.
Door buttons are portals; connecting curves show graph edges, not corridors.
"""
import json
import math
import sys
from pathlib import Path

import bpy


def project_root():
    """Find the repository both as a disk script and as embedded .blend text."""
    candidates = []
    if bpy.data.filepath:
        candidates.append(Path(bpy.data.filepath).resolve().parent)
    try:
        candidates.append(Path(__file__).resolve().parent)
    except NameError:
        pass
    candidates.append(Path.cwd())
    for candidate in candidates:
        if (candidate / 'labyrinth_runtime.py').is_file() and (candidate / 'labyrinth_engine.py').is_file():
            return candidate
    searched = ', '.join(str(path) for path in candidates)
    raise ModuleNotFoundError(
        'Prime Labyrinth modules were not found beside the saved .blend file. '
        f'Searched: {searched}'
    )


ROOT = project_root()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mathutils import Vector
from labyrinth_runtime import LabyrinthSession
import labyrinth_engine as le

SESSION = None
SCENE = None
COLLECTION = None
POSITIONS = {}
MATERIALS = {}
LIMIT = 40  # Presentation budget only; never changes mathematical doors.


def enum_set(owner, prop, value):
    valid = {i.identifier for i in owner.bl_rna.properties[prop].enum_items}
    if value not in valid:
        raise ValueError(f'{prop}: {value} unavailable; valid: {valid}')
    setattr(owner, prop, value)


def material(name, color, emission=0):
    mat = bpy.data.materials.new('PL ' + name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    sockets = {s.identifier: s for s in shader.inputs}
    sockets['Base Color'].default_value = (*color, 1)
    sockets['Roughness'].default_value = .65
    sockets['Emission Color'].default_value = (*color, 1)
    sockets['Emission Strength'].default_value = emission
    return mat


def obj(name, data, pos, mat=None):
    result = bpy.data.objects.new('PL ' + name, data)
    COLLECTION.objects.link(result)
    result.location = pos
    if mat:
        data.materials.append(mat)
    return result


def box(name, pos, size, mat):
    x, y, z = (v / 2 for v in size)
    mesh = bpy.data.meshes.new('PL box')
    mesh.from_pydata([(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z),
                      (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)], [],
                     [(0,3,2,1), (4,5,6,7), (0,1,5,4),
                      (1,2,6,5), (2,3,7,6), (3,0,4,7)])
    mesh.update()
    return obj(name, mesh, pos, mat)


def label(text, pos, size=.25, reverse=False):
    curve = bpy.data.curves.new('PL label', 'FONT')
    curve.body = text
    curve.size = size
    enum_set(curve, 'align_x', 'CENTER')
    result = obj(text, curve, pos, MATERIALS['text'])
    result.rotation_euler = (math.pi / 2, 0, math.pi if reverse else 0)
    return result


def position(key):
    if key not in POSITIONS:
        layer = le.PRIME_INDEX[key[0]] - le.PRIME_INDEX[7]
        lane = sum(1 for k in POSITIONS if k[0] == key[0])
        POSITIONS[key] = (lane * 22., layer * 14., 0.)
    return POSITIONS[key]


def room_geometry(key):
    p, h = key
    x, y, _ = position(key)
    state = SESSION.room(key)
    n = len(state['doors'])
    width = max(10., n * 3.2 + 1)
    floor = box(f'Room P{p} {h}', (x,y,-.12), (width,8,.24), MATERIALS['floor'])
    floor['room_key'] = json.dumps(key)
    floor['prime'] = p
    floor['triple'] = list(h)
    for side in (-1, 1):
        box('Side wall', (x+side*width/2,y,1.8), (.2,8,3.6), MATERIALS['wall'])
        box('Guide strip', (x+side*(width/2-.14),y,.22), (.05,7.8,.05), MATERIALS['cyan'])
    # Open roof is intentional for inspecting the graph from above.
    for wall_y in (-4,4):
        box('Lintel', (x,y+wall_y,3.18), (width,.2,.84), MATERIALS['wall'])
    label(f'PRIME LABYRINTH  /  P{p}', (x,y+3.86,3.18), .27)
    label(str(h), (x,y+3.85,2.85), .2)
    centers = [(i-(n-1)/2)*3.2 for i in range(n)]
    boundaries = [-width/2] + [v for c in centers for v in (c-.9,c+.9)] + [width/2]
    for left, right in zip(boundaries[::2], boundaries[1::2]):
        box('Front wall', (x+(left+right)/2,y+4,1.38), (right-left,.2,2.76), MATERIALS['wall'])
    for i, (cx, target) in enumerate(zip(centers, SESSION.targets(key)), 1):
        opened = state['opened'][i-1] is not None
        accent = MATERIALS['green' if opened else 'cyan']
        door = box(f'Door {i} P{p} {h}', (x+cx,y+3.96,1.3), (1.72,.12,2.6), MATERIALS['door'])
        door['source_key'] = json.dumps(key)
        door['target_key'] = json.dumps(target)
        door['door_index'] = i
        for dx in (-.94,.94):
            box('Door jamb', (x+cx+dx,y+3.8,1.35), (.08,.18,2.7), accent)
        box('Door header', (x+cx,y+3.8,2.7), (1.96,.18,.08), accent)
        label(f'{i}   /   P{target[0]}', (x+cx,y+3.77,2.1), .24)
        label(str(target[1]), (x+cx,y+3.77,1.65), .18)
        label('OPENED' if opened else 'TAKE DOOR', (x+cx,y+3.77,.6), .13)
    # The back door means reverse along the actual path, not every incoming edge.
    for dx in (-1,1):
        box('Back wall', (x+dx*(width/4+.5),y-4,1.38), (width/2-1,.2,2.76), MATERIALS['wall'])
    box('Entrance', (x,y-3.98,1.3), (2,.12,2.6), MATERIALS['door'])
    label('RETURN ALONG PATH', (x,y-3.8,2.1), .18, reverse=True)
    if not n:
        label('NO FORWARD DOORS', (x,y+3.8,1.5), .26)
    light = bpy.data.lights.new('PL room light', 'AREA')
    light.energy = 650
    light.size = 5
    obj('Room light', light, (x,y,3.5))


def edge_geometry(source, target, index):
    sx, sy, _ = position(source)
    tx, ty, _ = position(target)
    n = len(SESSION.targets(source))
    sx += (index-(n-1)/2)*3.2
    curve = bpy.data.curves.new('PL connection', 'CURVE')
    enum_set(curve, 'dimensions', '3D')
    curve.bevel_depth = .045
    spline = curve.splines.new('POLY')
    spline.points.add(3)
    for point, co in zip(spline.points, [(sx,sy+4,.1,1),(sx,sy+7,.1,1),
                                         (tx,ty-7,.1,1),(tx,ty-4,.1,1)]):
        point.co = co
    edge = obj('Connection', curve, (0,0,0), MATERIALS['cyan'])
    edge['source_key'] = json.dumps(source)
    edge['target_key'] = json.dumps(target)


def clear_geometry():
    for item in list(COLLECTION.objects):
        data = item.data
        bpy.data.objects.remove(item, do_unlink=True)
        if data and data.users == 0:
            if isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)
            elif isinstance(data, bpy.types.Curve):
                bpy.data.curves.remove(data)
            elif isinstance(data, bpy.types.Light):
                bpy.data.lights.remove(data)
            elif isinstance(data, bpy.types.Camera):
                bpy.data.cameras.remove(data)


def sync():
    SESSION.neighbourhood()
    clear_geometry()
    for key in SESSION.rooms:
        room_geometry(key)
    for key in SESSION.rooms:
        for i, target in enumerate(SESSION.targets(key)):
            if target in SESSION.rooms:
                edge_geometry(key, target, i)
    camera = obj('Player', bpy.data.cameras.new('PL Player'), (0,0,0))
    camera.data.lens = 24
    SCENE.camera = camera
    SCENE['prime_labyrinth_current'] = json.dumps(SESSION.current)
    inside()


def inside():
    x,y,_ = position(SESSION.current)
    SCENE.camera.location = (x,y-2.9,1.65)
    SCENE.camera.rotation_euler = (math.pi/2,0,0)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.show_region_ui = True
            space.overlay.show_overlays = False
            enum_set(space.shading, 'type', 'MATERIAL')
            enum_set(space.region_3d, 'view_perspective', 'CAMERA')
            space.region_3d.view_camera_zoom = 0


def overview():
    center = sum((Vector(v) for v in POSITIONS.values()), Vector()) / len(POSITIONS)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            region = area.spaces.active.region_3d
            enum_set(region, 'view_perspective', 'PERSP')
            region.view_location = center
            region.view_distance = max(24, len(POSITIONS)*8)
            region.view_rotation = Vector((0,1,-1.5)).to_track_quat('-Z','Y')


class PL_OT_action(bpy.types.Operator):
    bl_idname = 'prime_labyrinth.action'
    bl_label = 'Prime Labyrinth'
    action: bpy.props.StringProperty()
    index: bpy.props.IntProperty(default=1)

    def execute(self, context):
        if self.action == 'inside':
            inside()
        elif self.action == 'overview':
            overview()
        elif self.action == 'restart':
            reset()
        elif self.action == 'back':
            if SESSION.reverse():
                sync()
        elif self.action == 'door':
            targets = SESSION.targets(SESSION.current)
            if not 1 <= self.index <= len(targets):
                return {'CANCELLED'}
            target = targets[self.index-1]
            predicted = set(SESSION.rooms) | {target} | set(SESSION.targets(target))
            if len(predicted) > LIMIT:
                self.report({'WARNING'}, 'Prototype room budget reached. Reverse or restart.')
                return {'CANCELLED'}
            if SESSION.take(self.index):
                sync()
        return {'FINISHED'}


class PL_PT_panel(bpy.types.Panel):
    bl_label = 'Prime Labyrinth'
    bl_idname = 'PL_PT_panel'
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = 'Prime Labyrinth'

    @classmethod
    def poll(cls, context):
        return SESSION is not None and context.scene == SCENE

    def draw(self, context):
        layout = self.layout
        p,h = SESSION.current
        layout.label(text=f'Current: P{p} {h}')
        layout.label(text=f'{len(SESSION.rooms)} rooms / {len(SESSION.path)} steps')
        for i,target in enumerate(SESSION.targets(SESSION.current),1):
            op = layout.operator('prime_labyrinth.action', text=f'Door {i}: P{target[0]} {target[1]}')
            op.action, op.index = 'door', i
        row = layout.row()
        row.enabled = bool(SESSION.path)
        row.operator('prime_labyrinth.action', text='Return through entrance').action = 'back'
        for action, title in [('inside','Stand inside'),('overview','Overview'),('restart','Restart at P7')]:
            layout.operator('prime_labyrinth.action', text=title).action = action
        layout.label(text='Door choices move you between rooms.')
        layout.label(text='Cyan lines show connections.')


def reset():
    global SESSION
    SESSION = LabyrinthSession()
    POSITIONS.clear()
    sync()


def start():
    global SCENE, COLLECTION
    for cls in (PL_OT_action, PL_PT_panel):
        old = getattr(bpy.types, cls.__name__, None)
        if old:
            bpy.utils.unregister_class(old)
        bpy.utils.register_class(cls)
    SCENE = bpy.data.scenes.new('Prime Labyrinth')
    COLLECTION = bpy.data.collections.new('Prime Labyrinth Generated')
    SCENE.collection.children.link(COLLECTION)
    bpy.context.window.scene = SCENE
    SCENE.render.resolution_x, SCENE.render.resolution_y = 1280,720
    MATERIALS.update(wall=material('Wall',(.12,.16,.22)),
                     floor=material('Floor',(.045,.065,.1)),
                     door=material('Door',(.02,.04,.08)),
                     cyan=material('Cyan',(.03,.6,.95),1.5),
                     green=material('Opened',(.1,.8,.3),1),
                     text=material('Text',(.8,.92,1),.4))
    reset()
    print('Prime Labyrinth ready: two rooms. Sidebar > Prime Labyrinth.')


if __name__ == '__main__':
    start()
