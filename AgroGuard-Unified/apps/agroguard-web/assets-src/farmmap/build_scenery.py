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
    "tree_broadleaf": (1500, 150),
    "tree_palm": (1200, 120),
    "tree_conifer": (1200, 120),
    "bamboo": (1500, 150),
    "shrub": (400, 60),
    "rock_a": (300, 40),
    "rock_b": (300, 40),
    "rock_c": (300, 40),
    "reeds": (400, 80),
    "cloud": (700, 90),
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
    def __init__(self, name: str) -> None:
        self.name = name
        self.bm = bmesh.new()
        layers = self.bm.loops.layers
        self.col = (layers.float_color if hasattr(layers, "float_color") else layers.color).new("Col")

    def part(self, build, tint, smooth: bool = True) -> None:
        before = set(self.bm.faces)
        build(self.bm)
        fresh = [f for f in self.bm.faces if f not in before]
        for face in fresh:
            face.smooth = smooth
            for loop in face.loops:
                r, g, b = tint(loop.vert.co)
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
        export(f"{self.name}.glb")
        print(f"BUILT {self.name}.glb triangles={tris} budget={limit}")
        reset()


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


def ring(centre: Vector, tangent: Vector, radius: float, sides: int) -> list[Vector]:
    t = tangent.normalized()
    a = t.cross(UP)
    if a.length < 1e-4:
        a = t.cross(Vector((1.0, 0.0, 0.0)))
    a.normalize()
    b = t.cross(a)
    return [centre + (a * math.cos(k / sides * math.tau) + b * math.sin(k / sides * math.tau)) * radius for k in range(sides)]


def tube(points: list[Vector], radii: list[float], sides: int):
    def build(bm: bmesh.types.BMesh) -> None:
        rings = []
        for i, p in enumerate(points):
            tangent = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
            rings.append([bm.verts.new(c) for c in ring(p, tangent, radii[i], sides)])
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
            if floor is not None:
                z = max(z, floor)
            v.co = Vector((x + centre[0], y + centre[1], z + centre[2]))

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


def tree_broadleaf(lod: int) -> None:
    kit = Kit(f"tree_broadleaf_lod{lod}")
    height = 8.0
    trunk = [Vector((0, 0, 0)), Vector((0.1, 0, 2.2)), Vector((-0.1, 0.05, 4.2)), Vector((0, 0, 5.2))] if lod == 0 else [Vector((0, 0, 0)), Vector((0, 0, 4.4))]
    kit.part(tube(trunk, [0.32, 0.24, 0.16, 0.1][: len(trunk)] if lod == 0 else [0.3, 0.14], 8 if lod == 0 else 6), flat(BARK), smooth=False)
    dark, light = (0.06, 0.22, 0.07), (0.22, 0.48, 0.13)
    lobes = [((0, 0, 5.8), (2.6, 2.5, 2.1), 3, 0.0), ((1.7, 0.6, 5.0), (1.9, 1.8, 1.6), 3, 1.3), ((-1.6, -0.7, 5.2), (1.9, 1.9, 1.6), 3, 2.6), ((0.3, 1.5, 7.0), (1.5, 1.5, 1.3), 2, 3.9), ((-0.5, -1.2, 7.1), (1.4, 1.4, 1.2), 2, 5.2)]
    if lod == 1:
        lobes = [((0, 0, 5.8), (2.7, 2.6, 2.3), 2, 0.0), ((0.4, 0.3, 7.3), (1.5, 1.5, 1.2), 0, 1.0)]
    for i, (centre, radii, sub, seed) in enumerate(lobes):
        kit.part(blob(centre, radii, sub, amp=0.28, seed=seed), gradient(3.0, height, dark, light, 0.9 + 0.1 * (i % 3)))
    kit.finish("tree_broadleaf", lod)


def tree_palm(lod: int) -> None:
    kit = Kit(f"tree_palm_lod{lod}")
    rings = 10 if lod == 0 else 5
    trunk = [Vector((0.55 * math.sin(i / (rings - 1) * 1.1), 0.0, 8.5 * i / (rings - 1))) for i in range(rings)]
    kit.part(tube(trunk, [0.3 - 0.12 * i / (rings - 1) for i in range(rings)], 8 if lod == 0 else 5), gradient(0, 8.5, (0.30, 0.22, 0.15), (0.42, 0.33, 0.22)), smooth=False)
    crown = trunk[-1]
    fronds = 20 if lod == 0 else 8
    rnd = random.Random("palm")
    for i in range(fronds):
        a = i / fronds * math.tau + rnd.uniform(-0.15, 0.15)
        direction = Vector((math.cos(a), math.sin(a), rnd.uniform(0.15, 0.8)))
        kit.part(blade(crown, direction, rnd.uniform(3.0, 3.9), 0.6, 0.6, 9 if lod == 0 else 3, serrate=0.4 if lod == 0 else 0.0), gradient(7.0, 10.5, (0.10, 0.34, 0.09), (0.28, 0.52, 0.14)), smooth=False)
    if lod == 0:
        for i in range(3):
            a = i / 3 * math.tau
            kit.part(blob((crown.x + math.cos(a) * 0.3, math.sin(a) * 0.3, crown.z - 0.4), (0.22, 0.22, 0.26), 0), flat((0.34, 0.26, 0.10)), smooth=False)
    kit.finish("tree_palm", lod)


def tree_conifer(lod: int) -> None:
    kit = Kit(f"tree_conifer_lod{lod}")
    kit.part(tube([Vector((0, 0, 0)), Vector((0, 0, 1.8))] if lod == 1 else [Vector((0, 0, 0)), Vector((0, 0, 0.9)), Vector((0, 0, 1.8))], [0.26, 0.2] if lod == 1 else [0.26, 0.22, 0.2], 6 if lod == 1 else 8), flat(BARK), smooth=False)
    tiers = 3 if lod == 1 else 10
    segs = 8 if lod == 1 else 24
    rnd = random.Random("conifer")
    for t in range(tiers):
        z0 = 1.4 + t * (7.6 / tiers)
        radius = 2.6 * (1 - t / (tiers + 0.5))
        height = 7.6 / tiers * 2.0

        def cone(bm: bmesh.types.BMesh, z0=z0, radius=radius, height=height) -> None:
            base = [bm.verts.new((math.cos(k / segs * math.tau) * radius * (1 + (rnd.uniform(-0.12, 0.12) if lod == 0 else 0)), math.sin(k / segs * math.tau) * radius, z0)) for k in range(segs)]
            apex = bm.verts.new((0, 0, z0 + height))
            for k in range(segs):
                bm.faces.new((base[k], base[(k + 1) % segs], apex))
            bm.faces.new(base[::-1])

        kit.part(cone, gradient(1.4, 9.4, (0.04, 0.17, 0.09), (0.12, 0.34, 0.16), 0.92 + 0.08 * (t % 2)), smooth=False)
    kit.finish("tree_conifer", lod)


def bamboo(lod: int) -> None:
    kit = Kit(f"bamboo_lod{lod}")
    culms = 9 if lod == 0 else 5
    rnd = random.Random("bamboo")
    for i in range(culms):
        a = i / culms * math.tau + rnd.uniform(-0.3, 0.3)
        spread = rnd.uniform(0.25, 0.9)
        lean = rnd.uniform(0.04, 0.16)
        height = rnd.uniform(5.5, 7.5)
        count = 9 if lod == 0 else 3
        base = Vector((math.cos(a) * spread, math.sin(a) * spread, 0))
        pts = [base + Vector((math.cos(a) * lean * height * (k / (count - 1)) ** 2, math.sin(a) * lean * height * (k / (count - 1)) ** 2, height * k / (count - 1))) for k in range(count)]
        kit.part(tube(pts, [0.07 - 0.03 * k / (count - 1) for k in range(count)], 6 if lod == 0 else 4), gradient(0, 7.5, (0.34, 0.42, 0.14), (0.52, 0.60, 0.22)), smooth=False)
        for j in range(4 if lod == 0 else 1):
            b = j / 4 * math.tau + rnd.uniform(-0.3, 0.3)
            kit.part(blade(pts[-1], Vector((math.cos(b), math.sin(b), 0.5)), 1.1, 0.12, 0.5, 3 if lod == 0 else 2), gradient(5.0, 7.8, (0.12, 0.36, 0.10), (0.30, 0.52, 0.14)), smooth=False)
    kit.finish("bamboo", lod)


def shrub(lod: int) -> None:
    kit = Kit(f"shrub_lod{lod}")
    dark, light = (0.07, 0.24, 0.09), (0.24, 0.46, 0.14)
    if lod == 1:
        kit.part(blob((0, 0, 0.5), (0.8, 0.8, 0.6), 0, amp=0.2, uv=True), gradient(0, 1.2, dark, light))
    else:
        for i, (c, r, s) in enumerate([((0, 0, 0.5), (0.8, 0.75, 0.6), 0.0), ((0.6, 0.3, 0.45), (0.55, 0.55, 0.45), 1.7), ((-0.5, 0.4, 0.45), (0.55, 0.5, 0.45), 3.1), ((0.1, -0.55, 0.42), (0.5, 0.5, 0.4), 4.4)]):
            kit.part(blob(c, r, 2, amp=0.25, seed=s, floor=0.0), gradient(0, 1.2, dark, light, 0.92 + 0.08 * (i % 2)))
    kit.finish("shrub", lod)


def rock(letter: str, lod: int) -> None:
    kit = Kit(f"rock_{letter}_lod{lod}")
    seeds = {"a": (3.1, (1.0, 0.8, 0.6)), "b": (7.7, (0.8, 1.0, 0.7)), "c": (11.3, (0.9, 0.9, 0.9))}
    seed, radii = seeds[letter]
    grey = (0.34, 0.33, 0.31)

    def build(bm: bmesh.types.BMesh) -> None:
        blob((0, 0, 0.35), radii, 0 if lod == 1 else 3, amp=0.5, seed=seed, floor=0.0)(bm)
        if lod == 0:
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(14), verts=bm.verts, edges=bm.edges)
            bmesh.ops.triangulate(bm, faces=bm.faces)

    kit.part(build, lambda co: tuple(c * (0.85 + 0.3 * unit(co.z / 1.0)) for c in grey), smooth=False)
    kit.finish(f"rock_{letter}", lod)


def reeds(lod: int) -> None:
    kit = Kit(f"reeds_lod{lod}")
    rnd = random.Random("reeds")
    blades = 28 if lod == 0 else 8
    for i in range(blades):
        a = i / blades * math.tau + rnd.uniform(-0.3, 0.3)
        r = rnd.uniform(0.0, 0.35)
        base = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        direction = Vector((math.cos(a) * rnd.uniform(0.1, 0.4), math.sin(a) * rnd.uniform(0.1, 0.4), 1.0))
        kit.part(blade(base, direction, rnd.uniform(1.0, 1.5), 0.035, 0.3, 4 if lod == 0 else 2), gradient(0, 1.5, (0.18, 0.34, 0.10), (0.46, 0.55, 0.20)), smooth=False)
    for i in range(5 if lod == 0 else 2):
        a = i / 5 * math.tau
        base = Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, 0.9))
        kit.part(tube([base, base + Vector((0, 0, 0.18)), base + Vector((0, 0, 0.36))] if lod == 0 else [base, base + Vector((0, 0, 0.3))], [0.03, 0.045, 0.02] if lod == 0 else [0.04, 0.03], 6 if lod == 0 else 4), flat((0.30, 0.18, 0.09)), smooth=False)
    kit.finish("reeds", lod)


def cloud(lod: int) -> None:
    kit = Kit(f"cloud_lod{lod}")
    shade, top = (0.70, 0.75, 0.82), (1.0, 1.0, 1.0)
    lobes = [((0, 0, 6), (24, 18, 15), 2, 0.0), ((17, 3, 4), (17, 14, 12), 2, 1.7), ((-17, -2, 4), (18, 15, 12), 2, 3.1), ((5, -7, 12), (15, 12, 12), 2, 4.6), ((-6, 8, 11), (14, 11, 11), 2, 5.9), ((10, 8, 3), (13, 11, 9), 2, 7.2)]
    if lod == 1:
        lobes = [((0, 0, 6), (30, 20, 15), 1, 0.0), ((7, 1, 12), (18, 13, 12), 1, 1.7)]
    for centre, radii, sub, seed in lobes:
        kit.part(blob(centre, radii, sub, amp=0.22, seed=seed, floor=0.0), gradient(0.0, 26.0, shade, top))
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
    for letter in "abc":
        rock(letter, lod)
    reeds(lod)
    cloud(lod)
textures()
print("SCENERY BUILT")
