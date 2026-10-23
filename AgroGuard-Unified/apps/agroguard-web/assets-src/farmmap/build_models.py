"""Build the farm map 3D models and ground textures with Blender.

Run: blender --background --factory-startup --python build_models.py -- <public/models/farmmap>
Units are metres, Z up in Blender (exported Y up), origin at the base centre.
Shapes and colours are visual only; plant height and cover come from the season engines.
"""

import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np

OUT = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)

RICE = {
    "seedling": {"h": 0.18, "blades": 6, "leaf": (0.38, 0.62, 0.22), "panicles": 0},
    "tillering": {"h": 0.45, "blades": 16, "leaf": (0.18, 0.48, 0.14), "panicles": 0},
    "booting": {"h": 0.75, "blades": 22, "leaf": (0.12, 0.40, 0.10), "panicles": 0},
    "heading": {"h": 0.95, "blades": 22, "leaf": (0.16, 0.42, 0.12), "panicles": 8, "grain": (0.55, 0.60, 0.25), "droop": 0.3},
    "ripening": {"h": 0.95, "blades": 20, "leaf": (0.62, 0.58, 0.22), "panicles": 10, "grain": (0.80, 0.65, 0.25), "droop": 0.7},
}


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, rgb: tuple[float, float, float], rough: float = 0.8) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    mat.use_backface_culling = False
    return mat


def mesh_object(name: str, verts: list, faces: list, mat: bpy.types.Material) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def curve(angle: float, lean: float, height: float, t: float, droop: float, start) -> tuple[float, float, float]:
    bend = lean * (0.4 + t) + droop * t * t * 2.5
    radial = height * math.sin(min(bend, 2.6)) * t
    z = height * t * math.cos(min(bend, 1.4)) - droop * height * t**3 * 0.4
    return (start[0] + math.cos(angle) * radial, start[1] + math.sin(angle) * radial, start[2] + z)


def blade(verts: list, faces: list, angle: float, lean: float, height: float, width: float, segments: int, droop: float = 0.0, start=(0.0, 0.0, 0.0)) -> None:
    px, py = -math.sin(angle), math.cos(angle)
    first = len(verts)
    for s in range(segments + 1):
        t = s / segments
        x, y, z = curve(angle, lean, height, t, droop, start)
        if s < segments:
            # leaves are widest a third of the way up, as rice leaves are
            w = width * math.sin(math.pi * (0.25 + 0.75 * t)) * (1 - 0.6 * t) * 0.5
            verts.append((x + px * w, y + py * w, z))
            verts.append((x - px * w, y - py * w, z))
        else:
            verts.append((x, y, z))
    for s in range(segments - 1):
        a = first + 2 * s
        faces.append((a, a + 1, a + 3, a + 2))
    tip = first + 2 * segments
    faces.append((tip - 2, tip - 1, tip))


def grains(verts: list, faces: list, angle: float, lean: float, height: float, droop: float, start, count: int, size: float) -> None:
    for g in range(count):
        t = 0.25 + 0.75 * g / max(1, count - 1)
        x, y, z = curve(angle, lean, height, t, droop, start)
        side = 1 if g % 2 else -1
        ox, oy = -math.sin(angle) * size * side, math.cos(angle) * size * side
        first = len(verts)
        verts.extend([(x, y, z), (x + ox, y + oy, z - size * 0.6), (x + ox * 0.5, y + oy * 0.5, z - size * 1.6), (x - ox * 0.2, y - oy * 0.2, z - size * 0.8)])
        faces.append((first, first + 1, first + 2, first + 3))


def rice(stage: str, lod: int) -> None:
    spec = RICE[stage]
    rnd = random.Random(f"{stage}-{lod}")
    blades = spec["blades"] if lod == 0 else max(3, spec["blades"] // 4)
    segments = 5 if lod == 0 else 2
    verts: list = []
    faces: list = []
    for i in range(blades):
        angle = i / blades * math.tau + rnd.uniform(-0.2, 0.2)
        blade(verts, faces, angle, math.radians(rnd.uniform(8, 32)), spec["h"] * rnd.uniform(0.75, 1.0), 0.012 if spec["h"] < 0.3 else 0.018, segments)
    mesh_object(f"rice_{stage}_leaves", verts, faces, material(f"leaf_{stage}", spec["leaf"]))
    panicles = spec["panicles"] if lod == 0 else max(1, spec["panicles"] // 3) if spec["panicles"] else 0
    if panicles:
        pv: list = []
        pf: list = []
        cv: list = []
        cf: list = []
        for i in range(panicles):
            angle = i / panicles * math.tau + rnd.uniform(-0.3, 0.3)
            lean = math.radians(rnd.uniform(4, 12))
            culm = spec["h"] * rnd.uniform(0.82, 0.92)
            blade(cv, cf, angle, lean, culm, 0.008, segments)
            top = curve(angle, lean, culm, 1.0, 0.0, (0.0, 0.0, 0.0))
            blade(pv, pf, angle, math.radians(20), spec["h"] * 0.28, 0.012, segments, spec["droop"], top)
            if lod == 0:
                grains(pv, pf, angle, math.radians(20), spec["h"] * 0.28, spec["droop"], top, 10, 0.007)
        mesh_object(f"rice_{stage}_panicles", pv, pf, material(f"grain_{stage}", spec["grain"], 0.6))
        mesh_object(f"rice_{stage}_culms", cv, cf, material(f"leaf_{stage}", spec["leaf"]))
    export(f"rice_{stage}_lod{lod}.glb")


def weed_grass() -> None:
    rnd = random.Random("grass")
    verts: list = []
    faces: list = []
    for i in range(12):
        blade(verts, faces, i / 12 * math.tau + rnd.uniform(-0.3, 0.3), math.radians(rnd.uniform(20, 45)), 0.5 * rnd.uniform(0.7, 1.0), 0.014, 3)
    mesh_object("weed_grass", verts, faces, material("weed_grass", (0.30, 0.55, 0.20)))
    export("weed_grass.glb")


def weed_broadleaf() -> None:
    verts: list = []
    faces: list = []
    for i in range(7):
        a = i / 7 * math.tau
        cx, cy = math.cos(a) * 0.07, math.sin(a) * 0.07
        first = len(verts)
        verts.append((cx, cy, 0.03))
        for k in range(8):
            t = k / 8 * math.tau
            lx, ly = math.cos(t) * 0.06, math.sin(t) * 0.03
            verts.append((cx + lx * math.cos(a) - ly * math.sin(a), cy + lx * math.sin(a) + ly * math.cos(a), 0.03 + 0.04 * (math.cos(t) + 1) / 2))
        for k in range(8):
            faces.append((first, first + 1 + k, first + 1 + (k + 1) % 8))
    mesh_object("weed_broadleaf", verts, faces, material("weed_broadleaf", (0.22, 0.50, 0.18)))
    export("weed_broadleaf.glb")


def box(name: str, size: tuple[float, float, float], at: tuple[float, float, float], mat: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(mat)
    return obj


def cylinder(name: str, r: float, depth: float, at: tuple[float, float, float], mat: bpy.types.Material, rot=(0.0, 0.0, 0.0), r2: float | None = None, n: int = 16) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=n, radius1=r, radius2=r if r2 is None else r2, depth=depth, location=at, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def mill() -> None:
    wall = material("mill_wall", (0.75, 0.72, 0.66))
    roof = material("mill_roof", (0.45, 0.47, 0.50), 0.5)
    brick = material("mill_brick", (0.55, 0.30, 0.22))
    steel = material("mill_steel", (0.55, 0.57, 0.60), 0.4)
    box("shed", (10, 6, 4), (0, 0, 2), wall)
    bm = bmesh.new()
    v = [bm.verts.new(p) for p in ((-5.3, -3.3, 4), (5.3, -3.3, 4), (5.3, 3.3, 4), (-5.3, 3.3, 4), (-5.3, 0, 5.8), (5.3, 0, 5.8))]
    for f in ((0, 1, 5, 4), (3, 2, 5, 4), (0, 3, 4), (1, 2, 5)):
        bm.faces.new([v[i] for i in f])
    mesh = bpy.data.meshes.new("roof")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("roof", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(roof)
    cylinder("hopper", 1.2, 1.6, (3, 0, 6.6), steel, r2=0.25)
    cylinder("chimney", 0.35, 8, (-4, 2, 4), brick)
    box("door", (0.05, 2.4, 3), (5.03, 0, 1.5), roof)
    export("mill.glb")


def pump() -> None:
    concrete = material("concrete", (0.62, 0.62, 0.60))
    motor = material("pump_motor", (0.15, 0.30, 0.60), 0.4)
    pipe = material("pipe", (0.45, 0.47, 0.50), 0.4)
    box("plinth", (1.2, 0.8, 0.3), (0, 0, 0.15), concrete)
    cylinder("motor", 0.25, 0.7, (-0.15, 0, 0.55), motor, rot=(0, math.pi / 2, 0))
    cylinder("intake", 0.08, 1.5, (0.55, 0, 0.55), pipe, rot=(0, math.pi / 2, 0), n=12)
    cylinder("riser", 0.08, 0.9, (1.3, 0, 0.95), pipe, n=12)
    export("pump.glb")


def sluice() -> None:
    concrete = material("concrete", (0.62, 0.62, 0.60))
    steel = material("gate_steel", (0.40, 0.42, 0.45), 0.4)
    box("post_l", (0.3, 0.3, 1.6), (-1.0, 0, 0.8), concrete)
    box("post_r", (0.3, 0.3, 1.6), (1.0, 0, 0.8), concrete)
    box("lintel", (2.3, 0.3, 0.3), (0, 0, 1.75), concrete)
    box("gate", (1.6, 0.08, 1.0), (0, 0, 0.55), steel)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.25, minor_radius=0.03, major_segments=16, minor_segments=6, location=(0, 0.25, 2.1), rotation=(math.pi / 2, 0, 0))
    bpy.context.active_object.data.materials.append(steel)
    cylinder("stem", 0.03, 0.4, (0, 0.1, 1.95), steel, n=8)
    export("sluice.glb")


def export(name: str) -> None:
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / name),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )
    tris = sum(len(o.data.loop_triangles) or _tris(o) for o in bpy.context.scene.objects if o.type == "MESH")
    print(f"BUILT {name} triangles={tris}")
    reset()


def _tris(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def periodic_noise(size: int, seed: int, smooth: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    f = np.fft.fftfreq(size)
    k = np.sqrt(f[:, None] ** 2 + f[None, :] ** 2)
    spectrum = np.fft.fft2(rng.standard_normal((size, size))) * np.exp(-((k * smooth) ** 2))
    field = np.real(np.fft.ifft2(spectrum))
    return (field - field.min()) / (np.ptp(field) or 1)


def cracks(size: int, seed: int, cells: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    pts = rng.random((cells, 2)) * size
    out = np.empty((size, size), dtype=np.float32)
    ys, xs = np.mgrid[0:64, 0:size]
    for row in range(0, size, 64):
        d = []
        for px, py in pts:
            dx = np.abs(xs - px)
            dy = np.abs(ys + row - py)
            dx = np.minimum(dx, size - dx)
            dy = np.minimum(dy, size - dy)
            d.append(np.hypot(dx, dy))
        d = np.sort(np.stack(d), axis=0)
        out[row : row + 64] = d[1] - d[0]
    return out


def save_texture(name: str, rgb: np.ndarray) -> None:
    size = rgb.shape[0]
    img = bpy.data.images.new(name, size, size, alpha=False)
    rgba = np.concatenate([rgb, np.ones((size, size, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(OUT / f"{name}.jpg")
    img.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 82
    img.save()
    print(f"BUILT {name}.jpg")


def textures(size: int = 1024) -> None:
    coarse = periodic_noise(size, 1, 60)[..., None]
    fine = periodic_noise(size, 2, 8)[..., None]
    mud = np.array([0.23, 0.17, 0.12]) * (0.8 + 0.4 * fine)
    puddle = (coarse > 0.62).astype(float)
    mud = mud * (1 - puddle) + np.array([0.12, 0.10, 0.09]) * puddle
    save_texture("mud_wet", np.clip(mud, 0, 1))
    line = cracks(size, 3, 70)[..., None]
    dry = np.array([0.55, 0.43, 0.31]) * (0.85 + 0.3 * fine)
    dry = np.where(line < 2.2, np.array([0.28, 0.21, 0.15]), dry)
    save_texture("soil_dry", np.clip(dry, 0, 1))
    grass = (periodic_noise(size, 4, 4)[..., None] > 0.7).astype(float)
    clay = np.array([0.42, 0.31, 0.22]) * (0.85 + 0.3 * fine)
    clay = clay * (1 - grass) + np.array([0.30, 0.40, 0.20]) * grass
    save_texture("bund_clay", np.clip(clay, 0, 1))


reset()
for stage in RICE:
    for lod in (0, 1):
        rice(stage, lod)
weed_grass()
weed_broadleaf()
mill()
pump()
sluice()
textures()
print("ALL BUILT")
