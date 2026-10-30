"""Build the farm view scenery kit with Blender: trees, palm, bamboo, shrub, rocks, reeds and the building and water textures.

Run: blender --background --factory-startup --python build_scenery.py -- <public/models/farmmap>
Units are metres, Z up in Blender (exported Y up), origin at the base centre.
Each kind is one merged mesh with vertex colours, so it instances as a single draw call.
Shapes and colours stand for a kind of plant or rock, never a measured one.
"""

import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

OUT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)

UP = Vector((0.0, 0.0, 1.0))
BUDGET = {
    "tree_broadleaf": (3200, 250),
    "tree_palm": (2800, 200),
    "tree_conifer": (1500, 150),
    "bamboo": (3000, 200),
    "shrub": (900, 80),
    "rock_a": (700, 50),
    "rock_b": (700, 50),
    "rock_c": (700, 50),
    "reeds": (800, 90),
    "cloud": (700, 90),
    "banana": (1500, 140),
    "farm_hut": (900, 120),
    "buffalo": (1500, 260),
}
BARK = (0.20, 0.13, 0.08)
CULM = (0.42, 0.50, 0.18)


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def lerp(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def unit(v: float) -> float:
    return max(0.0, min(1.0, v))


def scenery_material() -> bpy.types.Material:
    mat = bpy.data.materials.new("scenery")
    mat.use_nodes = True
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    colour = nodes.new("ShaderNodeVertexColor")
    colour.layer_name = "Col"
    mat.node_tree.links.new(colour.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return mat


class Kit:
    def __init__(self, name: str, ao: float = 0.0) -> None:
        self.name = name
        self.ao = ao
        self.bm = bmesh.new()
        layers = self.bm.loops.layers
        self.col = (layers.float_color if hasattr(layers, "float_color") else layers.color).new("Col")

    def part(self, build, tint, smooth: bool = True, use_normal: bool = False) -> None:
        before = set(self.bm.faces)
        build(self.bm)
        fresh = [f for f in self.bm.faces if f not in before]
        for face in fresh:
            face.smooth = smooth
            for loop in face.loops:
                r, g, b = tint(loop.vert.co, face.normal) if use_normal else tint(loop.vert.co)
                loop[self.col] = (r, g, b, 1.0)

    def finish(self, key: str, lod: int) -> None:
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.color_attributes.active_color = mesh.color_attributes["Col"]
        mesh.color_attributes.render_color_index = mesh.color_attributes.find("Col")
        mesh.calc_loop_triangles()
        tris = len(mesh.loop_triangles)
        limit = BUDGET[key][lod]
        if tris > limit:
            raise SystemExit(f"{self.name}: {tris} triangles, budget {limit}")
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.data.materials.append(scenery_material())
        if self.ao:
            bake_ao(obj, self.ao)
        export(f"{self.name}.glb")
        print(f"BUILT {self.name}.glb triangles={tris} budget={limit}")
        reset()


def bake_ao(obj: bpy.types.Object, distance: float, samples: int = 48, strength: float = 0.65) -> None:
    mesh = obj.data
    scene = bpy.context.scene
    world = bpy.data.worlds.new("ao")
    world.light_settings.distance = distance
    scene.world = world
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.target = "VERTEX_COLORS"
    occlusion = mesh.color_attributes.new("AO", "FLOAT_COLOR", "CORNER")
    mesh.color_attributes.active_color = occlusion
    for other in scene.objects:
        other.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(type="AO")
    count = len(mesh.loops) * 4
    base = np.zeros(count, dtype=np.float32)
    shade = np.zeros(count, dtype=np.float32)
    mesh.color_attributes["Col"].data.foreach_get("color", base)
    occlusion.data.foreach_get("color", shade)
    base = base.reshape(-1, 4)
    shade = shade.reshape(-1, 4)
    base[:, :3] *= (1.0 - strength) + strength * shade[:, :1]
    mesh.color_attributes["Col"].data.foreach_set("color", base.ravel())
    mesh.color_attributes.remove(occlusion)
    mesh.color_attributes.active_color = mesh.color_attributes["Col"]


def export(name: str) -> None:
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    options = {
        "export_format": "GLB",
        "use_selection": True,
        "export_apply": True,
        "export_yup": True,
        "export_draco_mesh_compression_enable": True,
        "export_draco_mesh_compression_level": 6,
    }
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    colour = props.get("export_vertex_color")
    if colour and "ACTIVE" in [i.identifier for i in colour.enum_items]:
        options["export_vertex_color"] = "ACTIVE"
    if "export_all_vertex_colors" in props:
        options["export_all_vertex_colors"] = False
    bpy.ops.export_scene.gltf(filepath=str(OUT / name), **options)


def tube(points: list[Vector], radii: list[float], sides: int):
    def build(bm: bmesh.types.BMesh) -> None:
        rings = []
        last = None
        for i, p in enumerate(points):
            tangent = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
            if last is None:
                a = tangent.cross(UP)
                if a.length < 1e-4:
                    a = tangent.cross(Vector((1.0, 0.0, 0.0)))
            else:
                a = last - tangent * last.dot(tangent)
                if a.length < 1e-4:
                    a = tangent.cross(UP)
            a.normalize()
            last = a
            b = tangent.cross(a)
            rings.append([bm.verts.new(p + (a * math.cos(k / sides * math.tau) + b * math.sin(k / sides * math.tau)) * radii[i]) for k in range(sides)])
        for i in range(len(rings) - 1):
            for k in range(sides):
                bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])

    return build


def blob(centre: tuple, radii: tuple, sub: int, amp: float = 0.0, seed: float = 0.0, floor: float | None = None, uv: bool = False):
    def build(bm: bmesh.types.BMesh) -> None:
        made = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=4, radius=1.0) if uv else bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        for v in made["verts"]:
            n = 1.0 + amp * noise.noise(v.co * 1.7 + Vector((seed, seed * 0.7, seed * 0.3)))
            x, y, z = v.co.x * radii[0] * n, v.co.y * radii[1] * n, v.co.z * radii[2] * n
            z += centre[2]
            if floor is not None:
                z = max(z, floor)
            v.co = Vector((x + centre[0], y + centre[1], z))

    return build


def blade(base: Vector, direction: Vector, length: float, width: float, bend: float, segs: int, serrate: float = 0.0):
    def build(bm: bmesh.types.BMesh) -> None:
        d = direction.normalized()
        side = d.cross(UP)
        if side.length < 1e-4:
            side = Vector((1.0, 0.0, 0.0))
        side.normalize()
        pairs = []
        for s in range(segs):
            t = s / segs
            p = base + d * length * t - UP * bend * length * t * t
            w = width * math.sin(math.pi * (0.15 + 0.85 * t)) * (1 - 0.5 * t) * (1.0 - serrate * (s % 2))
            pairs.append((bm.verts.new(p + side * w), bm.verts.new(p - side * w)))
        tip = bm.verts.new(base + d * length - UP * bend * length)
        for s in range(segs - 1):
            bm.faces.new((pairs[s][0], pairs[s][1], pairs[s + 1][1], pairs[s + 1][0]))
        bm.faces.new((pairs[-1][0], pairs[-1][1], tip))

    return build


def gradient(z0: float, z1: float, dark: tuple, light: tuple, tint: float = 1.0):
    return lambda co: tuple(c * tint for c in lerp(dark, light, unit((co.z - z0) / (z1 - z0))))


def flat(colour: tuple):
    return lambda co: colour


def jitter(colour: tuple, co: Vector, amount: float = 0.1, scale: float = 2.3, seed: float = 0.0) -> tuple:
    n = noise.noise(co * scale + Vector((seed, seed * 1.3, seed * 0.7)))
    return tuple(unit(c * (1.0 + amount * n)) for c in colour)


def lobe_tint(centre_z: float, top_z: float, dark: tuple, light: tuple, seed: float = 0.0):
    def tint(co: Vector) -> tuple:
        height = unit((co.z - centre_z) / (top_z - centre_z))
        inner = 1.0 - 0.28 * unit(1.0 - math.hypot(co.x, co.y) / 2.6)
        warm = unit(0.5 + noise.noise(co * 1.4 + Vector((seed, 0.0, 0.0))) * 1.2)
        base = lerp(dark, light, height * 0.85 + 0.15 * warm)
        yellow = (base[0] * (1.0 + 0.22 * warm), base[1] * (1.0 + 0.06 * warm), base[2] * (1.0 - 0.1 * warm))
        return tuple(unit(c * inner) for c in yellow)

    return tint


def curve(points: list[Vector], t: float) -> Vector:
    scaled = t * (len(points) - 1)
    i = min(int(scaled), len(points) - 2)
    return points[i].lerp(points[i + 1], scaled - i)


def box(centre: tuple, size: tuple, turn: float = 0.0):
    def build(bm: bmesh.types.BMesh) -> None:
        made = bmesh.ops.create_cube(bm, size=1.0)
        for v in made["verts"]:
            x, y, z = v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]
            c, s = math.cos(turn), math.sin(turn)
            v.co = Vector((x * c - y * s + centre[0], x * s + y * c + centre[1], z + centre[2]))

    return build


def tree_broadleaf(lod: int) -> None:
    kit = Kit(f"tree_broadleaf_lod{lod}", ao=2.6 if lod == 0 else 0.0)
    height = 8.4
    if lod == 0:
        spine = [Vector((0, 0, 0)), Vector((0.12, 0.04, 1.2)), Vector((0.18, -0.05, 2.6)), Vector((-0.06, 0.03, 3.9)), Vector((0, 0, 4.9))]
        radii = [0.58, 0.36, 0.3, 0.24, 0.18]
        kit.part(tube(spine, radii, 10), lambda co: jitter(lerp((0.14, 0.09, 0.05), (0.27, 0.19, 0.12), unit(co.z / 4.5)), co, 0.18, 3.0), smooth=False)
        for i in range(5):
            a = i / 5 * math.tau + 0.4
            root = [Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.0)), Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.38)), Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, 0.9))]
            kit.part(tube(root, [0.1, 0.1, 0.07], 5), flat((0.16, 0.10, 0.06)), smooth=False)
        limbs = [((1.5, 0.5, 5.3), 0.15), ((-1.5, -0.6, 5.5), 0.15), ((0.4, 1.5, 5.8), 0.13), ((-0.5, -1.4, 6.0), 0.13)]
        for end, r in limbs:
            kit.part(tube([Vector((0.0, 0.0, 3.7)), Vector((end[0] * 0.5, end[1] * 0.5, 4.6)), Vector(end)], [r * 1.5, r * 1.1, r * 0.8], 5), flat((0.18, 0.12, 0.07)), smooth=False)
    else:
        kit.part(tube([Vector((0, 0, 0)), Vector((0, 0, 4.8))], [0.45, 0.16], 6), flat(BARK), smooth=False)
    dark, light = (0.05, 0.20, 0.06), (0.26, 0.52, 0.12)
    big = [((0, 0, 6.2), (2.7, 2.6, 2.1), 3, 0.0), ((1.9, 0.7, 5.5), (1.9, 1.8, 1.5), 3, 1.3), ((-1.8, -0.8, 5.7), (1.9, 1.9, 1.6), 3, 2.6), ((0.4, 1.7, 7.0), (1.6, 1.6, 1.3), 3, 3.9), ((-0.6, -1.4, 7.2), (1.5, 1.5, 1.2), 3, 5.2)]
    small = [((1.2, -1.5, 6.1), (1.2, 1.1, 1.0), 2, 6.4), ((-2.2, 1.0, 6.3), (1.1, 1.1, 0.95), 2, 7.7), ((0.3, 0.2, 8.0), (1.3, 1.2, 0.9), 2, 8.9), ((2.3, -0.4, 6.6), (1.0, 1.0, 0.9), 2, 9.6), ((-0.9, 1.9, 5.3), (1.0, 1.0, 0.8), 2, 10.1)]
    lobes = big + small if lod == 0 else [((0, 0, 6.0), (2.9, 2.8, 2.4), 2, 0.0), ((0.5, 0.3, 7.6), (1.6, 1.6, 1.2), 0, 1.0)]
    for i, (centre, radii, sub, seed) in enumerate(lobes):
        kit.part(blob(centre, radii, sub, amp=0.3, seed=seed), lobe_tint(3.6, height, dark, light, seed))
    kit.finish("tree_broadleaf", lod)


def frond(kit: Kit, crown: Vector, angle: float, length: float, lift: float, droop: float, leaflets: int, lod: int) -> None:
    flat_dir = Vector((math.cos(angle), math.sin(angle), 0.0))
    side = flat_dir.cross(UP).normalized()
    pts = [crown + flat_dir * (length * t) + UP * (length * t * lift - droop * t * t * length * 0.5) for t in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
    green = gradient(6.8, 10.6, (0.09, 0.30, 0.08), (0.30, 0.54, 0.14))
    if lod == 0:
        kit.part(tube(pts, [0.05, 0.045, 0.04, 0.032, 0.024, 0.012], 3), flat((0.36, 0.40, 0.15)), smooth=False)
    if lod == 1:
        kit.part(blade(crown, flat_dir + UP * lift, length, 0.55, droop * 0.5, 3), green, smooth=False)
        return
    for i in range(leaflets):
        t = 0.18 + 0.8 * i / (leaflets - 1)
        base = curve(pts, t)
        reach = 1.15 * (1.0 - 0.55 * t) + 0.2
        for sign in (-1.0, 1.0):
            direction = side * sign + flat_dir * 0.45 - UP * (0.35 + 0.35 * t)
            kit.part(blade(base, direction, reach, 0.07, 0.35, 2), green, smooth=False)


def tree_palm(lod: int) -> None:
    kit = Kit(f"tree_palm_lod{lod}", ao=1.2 if lod == 0 else 0.0)
    rings = 17 if lod == 0 else 5
    trunk = [Vector((0.5 * math.sin(i / (rings - 1) * 1.15) ** 1.4, 0.18 * math.sin(i / (rings - 1) * 2.3), 8.6 * i / (rings - 1))) for i in range(rings)]
    swell = [1.0 + (0.1 if i % 2 else 0.0) + 0.42 * max(0.0, 1.0 - i / 2.4) for i in range(rings)] if lod == 0 else [1.0] * rings
    kit.part(tube(trunk, [(0.29 - 0.1 * i / (rings - 1)) * swell[i] for i in range(rings)], 10 if lod == 0 else 5), lambda co: jitter(lerp((0.32, 0.25, 0.17), (0.50, 0.42, 0.30), unit(co.z / 8.6)), co, 0.14, 4.0), smooth=False)
    crown = trunk[-1] + Vector((0, 0, 0.05))
    if lod == 0:
        kit.part(tube([crown - Vector((0, 0, 0.7)), crown], [0.2, 0.17], 8), flat((0.45, 0.50, 0.20)), smooth=False)
    rnd = random.Random("palm")
    count = 15 if lod == 0 else 7
    for i in range(count):
        a = i / count * math.tau + rnd.uniform(-0.12, 0.12)
        high = i % 3 == 0
        frond(kit, crown, a, rnd.uniform(3.4, 4.2), 0.95 if high else rnd.uniform(0.35, 0.6), 2.9 if high else 3.4, 11, lod)
    if lod == 0:
        for i in range(5):
            a = i / 5 * math.tau + 0.3
            kit.part(blob((crown.x + math.cos(a) * 0.28, crown.y + math.sin(a) * 0.28, crown.z - 0.65), (0.2, 0.2, 0.24), 0), flat((0.40, 0.33, 0.12)), smooth=False)
    kit.finish("tree_palm", lod)


def tree_conifer(lod: int) -> None:
    kit = Kit(f"tree_conifer_lod{lod}", ao=1.5 if lod == 0 else 0.0)
    kit.part(tube([Vector((0, 0, 0)), Vector((0, 0, 4.0)), Vector((0, 0, 9.0))] if lod == 0 else [Vector((0, 0, 0)), Vector((0, 0, 2.0))], [0.28, 0.17, 0.05] if lod == 0 else [0.26, 0.2], 8 if lod == 0 else 6), flat(BARK), smooth=False)
    tiers = 4 if lod == 1 else 11
    segs = 8 if lod == 1 else 18
    rnd = random.Random("conifer")
    for t in range(tiers):
        z0 = 1.3 + t * (7.4 / tiers)
        radius = 2.7 * (1 - t / (tiers + 0.6))
        height = 7.4 / tiers * 2.1
        turn = rnd.uniform(0, math.tau)

        def cone(bm: bmesh.types.BMesh, z0=z0, radius=radius, height=height, turn=turn) -> None:
            base = []
            for k in range(segs):
                a = k / segs * math.tau + turn
                scallop = 1.0 + (0.16 * math.sin(k * 3.0 + turn) + rnd.uniform(-0.06, 0.06) if lod == 0 else 0.0)
                droop = -0.28 * (1 + math.sin(k * 2.0)) * radius * 0.2 if lod == 0 else 0.0
                base.append(bm.verts.new((math.cos(a) * radius * scallop, math.sin(a) * radius * scallop, z0 + droop)))
            apex = bm.verts.new((0, 0, z0 + height))
            for k in range(segs):
                bm.faces.new((base[k], base[(k + 1) % segs], apex))
            if lod == 0:
                inner = bm.verts.new((0, 0, z0 + height * 0.18))
                for k in range(segs):
                    bm.faces.new((base[(k + 1) % segs], base[k], inner))

        shade = 0.9 + 0.1 * (t % 2)
        kit.part(cone, lambda co, shade=shade: jitter(lerp((0.04, 0.16, 0.08), (0.14, 0.36, 0.16), unit((co.z - 1.4) / 8.0)), co, 0.2, 2.8, 1.0 * shade), smooth=False)
    kit.finish("tree_conifer", lod)


def bamboo(lod: int) -> None:
    kit = Kit(f"bamboo_lod{lod}", ao=0.6 if lod == 0 else 0.0)
    culms = 12 if lod == 0 else 5
    rnd = random.Random("bamboo")
    nodes = 12 if lod == 0 else 3
    for i in range(culms):
        a = i / culms * math.tau + rnd.uniform(-0.3, 0.3)
        spread = rnd.uniform(0.25, 1.0)
        lean = rnd.uniform(0.05, 0.2)
        height = rnd.uniform(5.2, 7.8)
        base = Vector((math.cos(a) * spread, math.sin(a) * spread, 0))
        pts = [base + Vector((math.cos(a) * lean * height * (k / (nodes - 1)) ** 2, math.sin(a) * lean * height * (k / (nodes - 1)) ** 2, height * k / (nodes - 1))) for k in range(nodes)]
        radii = [(0.075 - 0.035 * k / (nodes - 1)) * (1.28 if k % 2 == 0 and lod == 0 else 1.0) for k in range(nodes)]
        age = rnd.uniform(0.0, 1.0)
        kit.part(tube(pts, radii, 5 if lod == 0 else 4), lambda co, age=age: lerp(lerp((0.30, 0.40, 0.12), (0.52, 0.60, 0.22), unit(co.z / 7.5)), (0.60, 0.56, 0.24), age * 0.4), smooth=False)
        sprays = [(pts[-1], 0.0), (pts[-3], 0.5), (pts[-5], 1.0)] if lod == 0 else [(pts[-1], 0.0)]
        for origin, phase in sprays:
            for j in range(5 if lod == 0 else 1):
                b = j / 5 * math.tau + phase + rnd.uniform(-0.3, 0.3)
                kit.part(blade(origin, Vector((math.cos(b), math.sin(b), 0.45)), rnd.uniform(0.9, 1.3), 0.11, 0.55, 3 if lod == 0 else 2), gradient(4.0, 7.9, (0.10, 0.34, 0.09), (0.34, 0.56, 0.15)), smooth=False)
    kit.finish("bamboo", lod)


def shrub(lod: int) -> None:
    kit = Kit(f"shrub_lod{lod}", ao=0.5 if lod == 0 else 0.0)
    dark, light = (0.07, 0.24, 0.09), (0.26, 0.48, 0.14)
    if lod == 1:
        kit.part(blob((0, 0, 0.5), (0.9, 0.85, 0.6), 0, amp=0.2, uv=True), gradient(0, 1.2, dark, light))
    else:
        spots = [((0, 0, 0.5), (0.85, 0.8, 0.62), 0.0), ((0.65, 0.3, 0.45), (0.6, 0.58, 0.46), 1.7), ((-0.55, 0.4, 0.45), (0.6, 0.55, 0.46), 3.1), ((0.1, -0.6, 0.42), (0.55, 0.55, 0.42), 4.4), ((-0.4, -0.5, 0.36), (0.45, 0.42, 0.34), 5.3), ((0.4, 0.75, 0.38), (0.45, 0.42, 0.34), 6.2), ((0.0, 0.1, 0.85), (0.5, 0.5, 0.35), 7.1)]
        for i, (c, r, s) in enumerate(spots):
            kit.part(blob(c, r, 2, amp=0.3, seed=s, floor=0.0), lobe_tint(0.0, 1.2, dark, light, s))
        for i in range(5):
            a = i / 5 * math.tau + 0.5
            kit.part(blob((math.cos(a) * 0.62, math.sin(a) * 0.55, 0.62 + 0.12 * (i % 2)), (0.07, 0.07, 0.07), 0), flat((0.92, 0.35, 0.45) if i % 2 else (0.96, 0.80, 0.25)), smooth=False)
    kit.finish("shrub", lod)


def rock(letter: str, lod: int) -> None:
    kit = Kit(f"rock_{letter}_lod{lod}", ao=0.5 if lod == 0 else 0.0)
    seeds = {"a": (3.1, (1.0, 0.8, 0.6)), "b": (7.7, (0.8, 1.0, 0.7)), "c": (11.3, (0.9, 0.9, 0.9))}
    seed, radii = seeds[letter]
    grey = (0.36, 0.35, 0.33)
    moss = (0.20, 0.34, 0.12)

    def build(bm: bmesh.types.BMesh) -> None:
        blob((0, 0, 0.35), radii, 0 if lod == 1 else 3, amp=0.5, seed=seed, floor=0.0)(bm)
        if lod == 0:
            for v in bm.verts:
                v.co.z += 0.05 * math.sin(v.co.z * 14.0)
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(9), verts=bm.verts, edges=bm.edges)
            bmesh.ops.triangulate(bm, faces=bm.faces)

    def tint(co: Vector, normal: Vector) -> tuple:
        strata = 0.88 + 0.16 * math.sin(co.z * 17.0 + seed)
        base = tuple(c * strata * (0.85 + 0.3 * unit(co.z)) for c in jitter(grey, co, 0.3, 3.0, seed))
        grass = unit((normal.z - 0.35) * 1.8) * unit(0.35 + noise.noise(co * 2.5 + Vector((seed, 0, 0))) * 0.9)
        return lerp(base, moss, grass * 0.7)

    kit.part(build, tint, smooth=False, use_normal=True)
    if lod == 0:
        rnd = random.Random(seed)
        for _ in range(3):
            a = rnd.uniform(0, math.tau)
            kit.part(blob((math.cos(a) * radii[0] * 1.3, math.sin(a) * radii[1] * 1.3, 0.05), (0.2, 0.18, 0.12), 1, amp=0.4, seed=rnd.uniform(0, 9), floor=0.0), flat((0.40, 0.39, 0.36)), smooth=False)
    kit.finish(f"rock_{letter}", lod)


def reeds(lod: int) -> None:
    kit = Kit(f"reeds_lod{lod}", ao=0.3 if lod == 0 else 0.0)
    rnd = random.Random("reeds")
    blades = 40 if lod == 0 else 8
    for i in range(blades):
        a = i / blades * math.tau + rnd.uniform(-0.3, 0.3)
        r = rnd.uniform(0.0, 0.38)
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        direction = Vector((math.cos(a) * rnd.uniform(0.1, 0.45), math.sin(a) * rnd.uniform(0.1, 0.45), 1.0))
        old = rnd.random()
        kit.part(blade(base, direction, rnd.uniform(0.9, 1.6), rnd.uniform(0.025, 0.045), rnd.uniform(0.2, 0.5), 4 if lod == 0 else 2), lambda co, old=old: lerp(lerp((0.16, 0.32, 0.09), (0.46, 0.56, 0.20), unit(co.z / 1.5)), (0.60, 0.52, 0.25), old * 0.35), smooth=False)
    for i in range(6 if lod == 0 else 2):
        a = i / 6 * math.tau + 0.4
        top = 1.05 + 0.2 * (i % 3)
        base = Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.0))
        stem = [base, base + Vector((0, 0, top * 0.5)), base + Vector((0, 0, top))]
        head = [base + Vector((0, 0, top)), base + Vector((0, 0, top + 0.1)), base + Vector((0, 0, top + 0.28)), base + Vector((0, 0, top + 0.34))]
        kit.part(tube(stem, [0.016, 0.014, 0.012], 4), flat((0.30, 0.40, 0.14)), smooth=False)
        kit.part(tube(head if lod == 0 else head[:2], [0.03, 0.05, 0.045, 0.012] if lod == 0 else [0.04, 0.02], 6 if lod == 0 else 4), flat((0.30, 0.18, 0.09)), smooth=False)
    kit.finish("reeds", lod)


def banana_leaf(base: Vector, direction: Vector, length: float, width: float, droop: float, segs: int):
    def build(bm: bmesh.types.BMesh) -> None:
        d = direction.normalized()
        side = d.cross(UP)
        if side.length < 1e-4:
            side = Vector((1.0, 0.0, 0.0))
        side.normalize()
        rows = []
        for s in range(segs + 1):
            t = s / segs
            p = base + d * length * t - UP * droop * length * t * t
            w = width * math.sin(math.pi * (0.1 + 0.9 * t) ** 0.9) * (1.0 - 0.15 * t)
            fold = 0.07 * w
            rows.append((bm.verts.new(p + side * w + UP * fold), bm.verts.new(p), bm.verts.new(p - side * w + UP * fold)))
        for s in range(segs):
            a, b = rows[s], rows[s + 1]
            bm.faces.new((a[0], a[1], b[1], b[0]))
            bm.faces.new((a[1], a[2], b[2], b[1]))

    return build


def banana(lod: int) -> None:
    kit = Kit(f"banana_lod{lod}", ao=0.8 if lod == 0 else 0.0)
    rnd = random.Random("banana")
    stems = [(Vector((0.0, 0.0, 0.0)), 3.1), (Vector((0.75, 0.35, 0.0)), 2.3), (Vector((-0.6, 0.55, 0.0)), 1.7)] if lod == 0 else [(Vector((0.0, 0.0, 0.0)), 3.0)]
    for origin, height in stems:
        lean = Vector((rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), 0.0))
        spine = [origin + lean * (k / 5) + Vector((0, 0, height * k / 5)) for k in range(6 if lod == 0 else 2)]
        kit.part(tube(spine, [0.2 - 0.05 * k / 5 for k in range(len(spine))], 10 if lod == 0 else 5), lambda co: jitter(lerp((0.22, 0.30, 0.10), (0.42, 0.50, 0.20), unit(co.z / 3.1)), co, 0.12, 3.0), smooth=True)
        top = spine[-1]
        leaves = 8 if lod == 0 else 4
        for j in range(leaves):
            a = j / leaves * math.tau + rnd.uniform(-0.2, 0.2)
            lift = 0.9 if j % 3 == 0 else rnd.uniform(0.25, 0.55)
            kit.part(banana_leaf(top, Vector((math.cos(a), math.sin(a), lift)), rnd.uniform(1.9, 2.5), 0.42, 0.55, 5 if lod == 0 else 2), gradient(1.6, 4.6, (0.10, 0.36, 0.08), (0.34, 0.60, 0.14)), smooth=False)
    if lod == 0:
        top = Vector((0.75, 0.35, 2.3))
        stalk = [top, top + Vector((0.3, 0.1, -0.1)), top + Vector((0.45, 0.15, -0.55)), top + Vector((0.45, 0.15, -1.0))]
        kit.part(tube(stalk, [0.05, 0.05, 0.045, 0.04], 5), flat((0.28, 0.36, 0.14)), smooth=False)
        for hand in range(3):
            z = -0.4 - hand * 0.25
            for k in range(5):
                a = k / 5 * math.tau
                start = top + Vector((0.4 + math.cos(a) * 0.09, 0.15 + math.sin(a) * 0.09, z))
                finger = [start, start + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -0.1)), start + Vector((math.cos(a) * 0.09, math.sin(a) * 0.09, -0.22))]
                kit.part(tube(finger, [0.035, 0.04, 0.02], 4), flat((0.55, 0.62, 0.16)), smooth=False)
        kit.part(blob(top + Vector((0.45, 0.15, -1.1)), (0.1, 0.1, 0.2), 1, amp=0.1), flat((0.38, 0.10, 0.22)), smooth=False)
    kit.finish("banana", lod)


def farm_hut(lod: int) -> None:
    kit = Kit(f"farm_hut_lod{lod}", ao=0.8 if lod == 0 else 0.0)
    wood, bamboo_mat, tin = (0.28, 0.19, 0.11), (0.70, 0.60, 0.38), (0.50, 0.50, 0.48)
    floor_z = 1.3
    posts = [(-1.7, -1.3), (0.0, -1.3), (1.7, -1.3), (-1.7, 1.3), (0.0, 1.3), (1.7, 1.3)] if lod == 0 else [(-1.7, -1.3), (1.7, -1.3), (-1.7, 1.3), (1.7, 1.3)]
    for x, y in posts:
        kit.part(box((x, y, floor_z / 2), (0.2, 0.2, floor_z)), lambda co: jitter(wood, co, 0.2, 5.0), smooth=False)
    kit.part(box((0, 0, floor_z + 0.06), (4.0, 3.2, 0.12)), flat(wood), smooth=False)
    walls = [((0, -1.45, floor_z + 0.95), (3.6, 0.1, 1.7)), ((0, 1.45, floor_z + 0.95), (3.6, 0.1, 1.7)), ((-1.75, 0, floor_z + 0.95), (0.1, 2.9, 1.7)), ((1.75, 0, floor_z + 0.95), (0.1, 2.9, 1.7))]
    stripes = lambda co: jitter(bamboo_mat, co, 0.16, 7.0) if int(co.x * 6 + co.y * 6 + 100) % 2 else tuple(c * 0.9 for c in jitter(bamboo_mat, co, 0.16, 7.0))
    for centre, size in walls:
        kit.part(box(centre, size), stripes if lod == 0 else flat(bamboo_mat), smooth=False)
    if lod == 0:
        kit.part(box((0.3, -1.5, floor_z + 0.85), (0.8, 0.06, 1.4)), flat((0.12, 0.08, 0.05)), smooth=False)
        kit.part(box((-1.0, -1.5, floor_z + 1.15), (0.6, 0.06, 0.5)), flat((0.10, 0.08, 0.06)), smooth=False)
        for side in (-1, 1):
            kit.part(box((0.9 * side, -2.05 if side > 0 else -2.05, 0.6), (0.06, 0.06, 1.3), 0.0), flat(wood), smooth=False)
        kit.part(box((-0.5, -2.35, 0.65), (0.08, 0.08, 1.45), 0.0), flat(wood), smooth=False)
        kit.part(box((0.5, -2.35, 0.65), (0.08, 0.08, 1.45), 0.0), flat(wood), smooth=False)
        for r in range(5):
            kit.part(box((0.0, -2.35, 0.25 + r * 0.26), (1.0, 0.07, 0.05)), flat(wood), smooth=False)
        kit.part(box((0, -1.75, floor_z + 0.16), (3.8, 0.35, 0.05)), flat(wood), smooth=False)

    def roof(bm: bmesh.types.BMesh) -> None:
        z0, z1 = floor_z + 1.8, floor_z + 3.0
        w, d = 2.5, 2.0
        a = [bm.verts.new(p) for p in ((-w, -d, z0), (w, -d, z0), (w, d, z0), (-w, d, z0))]
        r0, r1 = bm.verts.new((-w + 0.35, 0, z1)), bm.verts.new((w - 0.35, 0, z1))
        bm.faces.new((a[0], a[1], r1, r0))
        bm.faces.new((a[2], a[3], r0, r1))
        bm.faces.new((a[1], a[2], r1))
        bm.faces.new((a[3], a[0], r0))
        thick = [bm.verts.new((p[0], p[1], p[2] - 0.06)) for p in ((-w, -d, z0), (w, -d, z0), (w, d, z0), (-w, d, z0))]
        bm.faces.new(thick[::-1])

    kit.part(roof, lambda co: jitter(lerp((0.36, 0.38, 0.38), (0.60, 0.58, 0.55), unit((co.z - 3.1) / 1.2)), co, 0.18, 2.0), smooth=False)
    kit.finish("farm_hut", lod)


def buffalo(lod: int) -> None:
    kit = Kit(f"buffalo_lod{lod}", ao=0.5 if lod == 0 else 0.0)
    hide, muzzle, horn = (0.17, 0.17, 0.19), (0.30, 0.26, 0.25), (0.72, 0.66, 0.52)
    sub = 2 if lod == 0 else 0
    tone = lambda co: jitter(hide, co, 0.2, 3.0, 2.0)
    kit.part(blob((0, 0, 1.08), (1.15, 0.5, 0.52), sub, amp=0.05, seed=1.0), tone)
    kit.part(blob((0.65, 0, 1.12), (0.65, 0.5, 0.5), sub, amp=0.05, seed=2.0), tone)
    kit.part(blob((-0.7, 0, 1.1), (0.55, 0.46, 0.5), sub, amp=0.05, seed=3.0), tone)
    kit.part(tube([Vector((0.9, 0, 1.2)), Vector((1.3, 0, 1.25)), Vector((1.62, 0, 1.12))], [0.3, 0.26, 0.2], 8 if lod == 0 else 5), tone, smooth=True)
    kit.part(blob((1.88, 0, 1.0), (0.34, 0.2, 0.26), sub, amp=0.05, seed=4.0), tone)
    kit.part(blob((2.13, 0, 0.9), (0.14, 0.17, 0.14), 1 if lod == 0 else 0), flat(muzzle), smooth=True)
    for side in (-1, 1):
        if lod == 0:
            horn_pts = [Vector((1.8, side * 0.14, 1.2)), Vector((1.72, side * 0.34, 1.28)), Vector((1.55, side * 0.5, 1.4)), Vector((1.35, side * 0.52, 1.5))]
            kit.part(tube(horn_pts, [0.05, 0.045, 0.03, 0.012], 5), flat(horn), smooth=False)
            kit.part(blob((1.7, side * 0.2, 1.1), (0.05, 0.1, 0.05), 0), tone, smooth=False)
        for fore in (0, 1):
            x = 0.78 if fore else -0.78
            y = side * 0.27
            leg = [Vector((x, y, 0.95)), Vector((x, y, 0.5)), Vector((x, y, 0.06))]
            kit.part(tube(leg, [0.14 if fore else 0.16, 0.09, 0.075], 6 if lod == 0 else 4), tone, smooth=True)
            kit.part(box((x, y, 0.03), (0.17, 0.17, 0.08)), flat((0.08, 0.07, 0.07)), smooth=False)
    if lod == 0:
        kit.part(tube([Vector((-1.2, 0, 1.3)), Vector((-1.5, 0, 1.0)), Vector((-1.5, 0, 0.45))], [0.05, 0.035, 0.02], 5), tone, smooth=True)
        kit.part(blob((-1.5, 0, 0.4), (0.05, 0.05, 0.12), 0), flat((0.08, 0.07, 0.07)), smooth=False)
    kit.finish("buffalo", lod)


def cloud(lod: int) -> None:
    kit = Kit(f"cloud_lod{lod}")
    shade, top = (0.70, 0.75, 0.82), (1.0, 1.0, 1.0)
    lobes = [((0, 0, 6), (24, 18, 15), 2, 0.0), ((17, 3, 4), (17, 14, 12), 2, 1.7), ((-17, -2, 4), (18, 15, 12), 2, 3.1), ((5, -7, 12), (15, 12, 12), 2, 4.6), ((-6, 8, 11), (14, 11, 11), 2, 5.9), ((10, 8, 3), (13, 11, 9), 2, 7.2)]
    if lod == 1:
        lobes = [((0, 0, 6), (30, 20, 15), 1, 0.0), ((7, 1, 12), (18, 13, 12), 1, 1.7)]
    for centre, radii, sub, seed in lobes:
        kit.part(blob(centre, radii, sub, amp=0.22, seed=seed, floor=centre[2]), gradient(0.0, 26.0, shade, top))
    kit.finish("cloud", lod)


def periodic_noise(size: int, seed: int, smooth: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = np.fft.fftfreq(size)
    k = np.sqrt(f[:, None] ** 2 + f[None, :] ** 2)
    spectrum = np.fft.fft2(rng.standard_normal((size, size))) * np.exp(-((k * smooth) ** 2))
    field = np.real(np.fft.ifft2(spectrum))
    return (field - field.min()) / (np.ptp(field) or 1)


def save_texture(name: str, rgb: np.ndarray, data: bool = False) -> None:
    size = rgb.shape[0]
    img = bpy.data.images.new(name, size, size, alpha=False)
    if data:
        img.colorspace_settings.name = "Non-Color"
    rgba = np.concatenate([rgb, np.ones((size, size, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(OUT / f"{name}.jpg")
    img.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 82
    img.save()
    print(f"BUILT {name}.jpg")


def textures(size: int = 512) -> None:
    fine = periodic_noise(size, 21, 6)[..., None]
    coarse = periodic_noise(size, 22, 50)[..., None]
    height = periodic_noise(size, 23, 34) + 0.4 * periodic_noise(size, 24, 11)
    dx = np.roll(height, -1, 1) - np.roll(height, 1, 1)
    dy = np.roll(height, -1, 0) - np.roll(height, 1, 0)
    normal = np.stack([-dx * 38, -dy * 38, np.ones_like(height)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    save_texture("water_normal", normal * 0.5 + 0.5, data=True)
    x = np.arange(size)[None, :, None]
    ridge = np.sin(x * math.tau * 8 / size)
    tin = np.array([0.56, 0.59, 0.61]) * (0.82 + 0.18 * ridge) * (0.9 + 0.2 * fine)
    rust = np.clip((coarse - 0.72) * 6, 0, 1)
    tin = tin * (1 - rust) + np.array([0.42, 0.24, 0.15]) * rust * (0.8 + 0.4 * fine)
    save_texture("roof_tin", np.clip(np.broadcast_to(tin, (size, size, 3)), 0, 1))
    ys, xs = np.mgrid[0:size, 0:size]
    tile_px = 32
    row = ys // tile_px
    col = (xs + (row % 2) * tile_px // 2) // tile_px
    rng = np.random.default_rng(31)
    tone = rng.random((size // tile_px + 1, size // tile_px + 2))[row, col % (size // tile_px + 2)][..., None]
    along = ((ys % tile_px) / tile_px)[..., None]
    across = np.sin(math.pi * (((xs + (row % 2) * tile_px // 2) % tile_px) / tile_px))[..., None]
    tile = np.array([0.58, 0.27, 0.16]) * (0.8 + 0.35 * tone) * (0.62 + 0.45 * across) * (0.8 + 0.25 * along) * (0.92 + 0.16 * fine)
    lip = ((ys % tile_px) >= tile_px - 3)[..., None]
    tile = np.where(lip, tile * 0.4, tile)
    save_texture("roof_tile", np.clip(tile, 0, 1))
    plaster = np.array([0.80, 0.77, 0.70]) * (0.9 + 0.2 * fine)
    stain = np.clip((coarse - 0.66) * 5, 0, 1)
    plaster = plaster * (1 - 0.18 * stain) + np.array([0.0, 0.0, -0.02]) * stain
    save_texture("wall_plaster", np.clip(plaster, 0, 1))


reset()
for lod in (0, 1):
    tree_broadleaf(lod)
    tree_palm(lod)
    tree_conifer(lod)
    bamboo(lod)
    shrub(lod)
    banana(lod)
    farm_hut(lod)
    buffalo(lod)
    for letter in "abc":
        rock(letter, lod)
    reeds(lod)
    cloud(lod)
textures()
print("SCENERY BUILT")
