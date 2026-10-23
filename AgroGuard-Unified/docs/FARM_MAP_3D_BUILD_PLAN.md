# Farm map 3D build plan

Owner request (23 Oct): take the farm map to a detailed 3D view that holds thousands of real fields, using Three.js, React Three Fiber, Blender MCP and Spline MCP.

## Status on 23 Oct (95550b1)
- **Built, Phases 1, 2 and part of 4:** with 3D terrain on (the T key), paddies, crop fields and your own parcels rise as `fill-extrusion` layers, and they follow the layer toggles. A water surface appears only on parcels with a Kalman depth above the soil. Extrusion heights are visual only.
- **Change from the plan:** MapLibre's own `fill-extrusion` replaces the R3F custom layer for fields. It draws each tile in one batch on the GPU, sits on the terrain, and keeps the existing hover and click picking. A three.js layer is still the route for Blender models in Phase 3.
- **Blocked:** Phase 3 needs the Blender add-on enabled and this session reloaded, so the Blender tools load.
- **Built (Phase 5, light):** with 3D terrain on, the sun's position at the farm's coordinates and the viewer's clock lights the fields (NOAA solar formula, about 0.5 degree). At night a dim fixed light stays. It is illustrative lighting, not a shadow study.
- **Not built:** the cross-section tool. A trench or bund section needs measured bund heights and trench depths, and the contracts hold neither; drawing one would mean inventing numbers. It waits for the design mode in the rice-shrimp plan, where the farmer enters those values.
- **Not measured:** frame times on a phone (headless Chrome with a software renderer says nothing about real devices), and the prior-art check.

## What is already here
- `three` 0.180, `@react-three/fiber` 9, `@react-three/drei` 10 and `maplibre-gl` 6.14 are installed. No new runtime dependency is needed for the core.
- `components/farm3d/` is a standalone R3F scene of one demo farm (Terrain, Paddies with an instanced plant mesh, Bunds, Canals, Structures, Robots, Sensors), about 2,900 lines.
- `components/farmmap/` is the 2D MapLibre map, with real contract boundaries, OSM outlines and AWS Terrain Tiles relief.
- MCP servers set up on 23 Oct: `blender` (uvx blender-mcp, local to this project) and `Spline` (registered by the Spline app, user scope). Both reported Connected in `claude mcp list`.

## Rules
- **Geometry comes from data.** Field shapes come from contract rings or OSM outlines; heights from the DEM tiles the map already uses. Blender and Spline make assets (pumps, gates, huts, drones, trench sections), never field shapes or values.
- **Art is labelled.** A modelled asset at a real place says "illustrative model" on hover, as the farm positions do today.
- **2D stays the accessible path.** The 3D view is added on top: the canvas is `aria-hidden`, and every field it shows can be reached in the list and panel by keyboard. Motion follows `prefers-reduced-motion`.
- **Measure before claiming speed.** Each phase records frame time on named hardware. No performance claim without that number.

## Phase 1: one 3D layer inside the map
- Render R3F through a MapLibre custom layer (`CustomLayerInterface`) that shares MapLibre's WebGL context and camera matrix. Fields then stay where they are on the map, and 2D and 3D cannot drift apart.
- Toggle: "3D fields" in the layer panel. It is off by default on coarse pointers until Phase 4 measures phones.
- Reuse the `farm3d` materials and the paddy stage colours from `farmMapTheme.ts`.
- Test: a field ring projects to the same screen point in MapLibre and in the R3F layer, to within 1 px.

## Phase 2: thousands of fields
- **Merged geometry per map tile.** Triangulate each ring with `THREE.ShapeUtils.triangulateShape` and merge a tile's fields into one `BufferGeometry` with a per-vertex `fieldIndex`. A tile is one draw call, not one per field.
- **Data on the GPU.** Status, stage and water depth band go in a `DataTexture` looked up by `fieldIndex`. A data refresh updates the texture, not the geometry.
- **Picking.** A second render pass writes `fieldIndex` as colour, and a click reads one pixel. No ray test per field.
- **Level of detail.** Far away: flat coloured fields. Mid range: bund walls extruded from the ring. Near: plant instances (the existing `instancedMesh`) and assets.
- **Work off the main thread.** Triangulation runs in a Web Worker and caches per tile in IndexedDB, keyed by the contract sha256.
- Test: 5,000 synthetic rings (generated only in the test, labelled synthetic) give one draw call per tile, and picking returns the right id.

## Phase 3: assets from Blender and Spline
- **Blender MCP:** model the kit (sluice gate, pump house, AWD tube, drone, storage hut, bund section, rice-fish refuge trench). Export glTF 2.0, compressed with meshopt, and load it with three's own `GLTFLoader` and `MeshoptDecoder` (both ship with three, so no new package).
- **Spline MCP:** design the onboarding and empty-state scenes and the asset look. Export glTF rather than adding the Spline runtime package, so the page loads one 3D engine, not two.
- Budget per asset: a triangle count and file size agreed in Phase 3, checked in a test that reads each `.glb` header.
- Assets live in `public/farmmap/models/`, each with a `SOURCE.md` naming the author tool and the licence.

## Phase 4: water, terrain and the refuge-trench view
- Terrain mesh from the same Terrarium DEM tiles as the 2D relief, so the 2D and 3D heights match.
- Water surface per paddy at the Kalman depth band (p50, with p10 and p90 as a translucent range). It is shown only where a band exists; otherwise the paddy shows "depth unknown".
- A cross-section tool: cut a line across a field to see bund height, water level and trench depth. This is the view the rice-fish and rice-shrimp refuge design (handoff Next block 1) needs.
- Measure on a named mid-range phone and laptop: frame time p50 and p95 at 1,000 and 5,000 fields. Record the numbers in the handoff, whatever they are.

## Phase 5: polish
- Time-of-day light from the farm's local time; season scrub from the existing season strip.
- Screenshots at 1440 and 375 px in light and dark, and in Burmese.
- A cited prior-art check of 3D farm twins, each claim classified common, different, or no public product found.

## Steps the owner does by hand
- In Blender: Edit → Preferences → Add-ons, find "MCP for Blender" (installed into Blender 5.2), enable it, then click Start MCP Server in the sidebar. Keep Blender open while Claude uses it.
- Keep the Spline app open while Claude uses its MCP server.
- Restart Claude Code (or reload the VS Code window) so this session loads the new Blender tools.
