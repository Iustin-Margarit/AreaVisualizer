# AreaVisualizer — Plan of Attack

A zero-friction tool: open the page, type an area (or its sides), see how big it really is
next to familiar objects, in 2D or 3D. No accounts, no backend, works on phone and PC.

## Guiding decisions

| Decision | Why |
|---|---|
| Static site, plain ES modules, **no build step** | Instant to host anywhere (GitHub Pages / Netlify / Cloudflare Pages), nothing to break. |
| **No framework** | The UI is one form + one stage. A tiny store is enough. |
| Everything internal is **square meters / meters** | Units are only an input/output concern. Map & AR (future) also want meters. |
| A renderer-agnostic **scene model** | 2D, 3D, Map and AR all draw the *same* scene. Adding a view never touches the math. |
| **Views are plug-ins, lazy-loaded** | three.js (~670 KB) is only downloaded when someone picks 3D (or hovers the button). |
| State lives in the **URL** | Shareable links for free; preferred units, view and display settings are remembered in localStorage. |
| three.js **pinned** via an import map (CDN) and as an exact devDependency | Same version in the browser and in the Node tests. |

## Architecture

```
 UI controls ──set()──▶ store ──subscribe──▶ render()
                                               │
               resolveInput(state) → { areaM2, dims, areaUnit, system }
                                               │
                    ┌──────────────────────────┼──────────────────────┐
                    ▼                          ▼                      ▼
            writeUrl / savePrefs   buildScene({ …, layout,       compare card + results
                                     landmark, objects })      (objects, landmarks,
                                               │                other units)
                                               ▼
                       active view.update(scene, { system, areaLabel, night, settings, reframe })
                                   ┌──────┬──────┬───────┬──────┐
                                   │  2D  │  3D  │ Map*  │ AR*  │   * future
                                   └──────┴──────┴───────┴──────┘
```

### Folder layout

```
index.html            app shell, import map (pins three.js), meta + favicon
css/styles.css        mobile-first, light/dark; 3D colours are CSS tokens too
js/
  main.js             bootstrap: store ↔ URL/prefs ↔ scene ↔ view; theme; loading + fallback
  state.js            defaults, validation (sanitize), initial state, tiny store
  url.js              state ⇄ query string (?m=dims&w=4&l=5&s=rectangle&h=2.5&hu=m&v=3d&c=tennis&o=person,~Sofa:2:0.9:0.8)
  prefs.js            remembered language/units/view/display settings, locale → metric or imperial
  i18n/               translations: index.js (t(), plurals, number locale), dom.js (data-i18n),
                      en.js (the reference) + es, de, fr, it, pt, ru — add a language as one file
  core/               pure logic, no DOM — unit tested
    units.js          area, length + volume units, conversions, natural unit for a size
    input.js          sides or area (whichever was typed last) → area in m², dims; height → volume;
                      system switching
    shapes.js         area + shape → width/depth/radius
    references.js     objects for a scale, the visitor's own objects; key dimension to print
    comparisons.js    "≈ 19% of a tennis court", "≈ 2× Vatican City"
    landmarks.js      landmark shapes + markings; which one to draw
    scene.js          the scene model views consume ('front' or 'side' layout)
    format.js         number / length formatting, lenient parsing, HTML escaping
  data/               plain data tables — add content without touching logic
    references.js     person, car, tree… with real dimensions and a `kind`
    landmarks.js      credit card → Earth's land area (real sizes for rectangles)
    outlines.js       generated place outlines — see tools/outlines.mjs
    presets.js        quick picks, one list per measuring system
  ui/
    controls.js       size card: width × length → area (linked both ways), shape, optional height
                      → volume, quick picks
    units-toggle.js   header Metric / Imperial / Both switch
    language-picker.js  header language menu; flags.js draws its little round flags
    compare.js        objects (remove, add from catalog, add your own) + landmark comparisons
    results.js        the size in the other system and in every unit
    stage-chrome.js   on the stage: 2D/3D switch, display settings, full screen
    popover.js        small popover helper (outside click / Esc to close)
    share.js          share sheet on phones, copy link elsewhere
    toast.js          small status messages
  views/
    registry.js       list of views (add Map / AR here)
    palette.js        colour per object kind (2D and 3D)
    labels.js         label collision layout (2D and 3D)
    stage-ui.js       zoom/fit buttons, legend and 3D camera bar markup
    view2d.js         SVG top-down view (pan / zoom / pinch)
    2d/               camera, grid, silhouettes — pure, tested
    view3d.js         three.js view (orbit, camera presets incl. eye level, spin, night sky)
    3d/gltf.js        loads, poses and scales the downloaded models
    3d/               math (framing, grid levels), ground shader, models — tested
assets/models/        downloaded 3D models (.glb), assets/top/ their pictures from above
tools/outlines.mjs    regenerates js/data/outlines.js from public-domain map data
tools/models.mjs      re-downloads and prepares the 3D models → assets/models, js/data/models.js
tools/topviews.html   renders the models from above → assets/top (open via the dev server)
tools/vendor.mjs      copies three.js from node_modules → vendor/three (served by the site itself)
vendor/three/         the parts of three.js the 3D view uses (MIT licence included)
tests/                node --test (needs `npm install` once, for three.js)
```

### Contracts (the concrete everything else stands on)

**Scene** (all meters, origin = center of the area, x → right, z → toward viewer, y → up):

```js
{
  areaM2, span,
  height,                                            // 0 for a flat area; else it's a box this tall
  shape: { type: 'square'|'rectangle'|'circle', width, depth, radius? },
  references: [{ id, name, kind, w, d, h, x, z }],   // x/z = footprint center
  landmark: { id, name, shape: { width, depth, rings, marks }, x, z } | null,
  bounds: { minX, maxX, minZ, maxZ, maxY },
}
```

**View** module exports `createView()` returning:

```js
{
  mount(containerEl),
  update(scene, {
    system: 'metric'|'imperial', both: false,          // labels only; geometry is always meters
    areaLabel: '50 m²',
    volumeLabel: '125 m³',                             // '' without a height
    night: false,                                      // dark theme
    settings: { grid, labels, measures, shadows },     // display switches
    reframe: true,                                     // false: same scene, keep the camera
  }),
  unmount(),
}
```

Registered in `js/views/registry.js` with `{ id, label, layout, load, isSupported? }`.
`mount` may throw (e.g. no WebGL): the app then shows a message and stays on / falls back to 2D.

## Phases

### Phase 0 — Foundation ✅
- [x] Folder structure, app shell, mobile-first CSS with light/dark
- [x] Units, shapes, reference picking, comparisons, scene builder
- [x] Store + URL sync, view plug-in registry with lazy loading, unit tests

### Phase 1 — Inputs & results ✅
- [x] "Width × length" input mode with its own length units (m, cm, km, ft, in, yd, mi)
- [x] Default units by locale (en-US → ft²/ft), remembered preferences, links override both
- [x] Copy link (native share sheet on phones), page title shows the area
- [x] Results lead with what you didn't type, in both measuring systems
- [x] Comparison wording ("≈ 19% of a tennis court", "≈ 2× Vatican City") and 23 landmarks
      from a credit card to Earth's land area; picks mix bigger and smaller things
- [x] Presets use official dimensions per system (tennis court 23.77 × 10.97 m / 78 × 36 ft)

### Phase 2 — 2D view ✅
- [x] Top-down silhouettes per `kind`, colours from `views/palette.js`
- [x] Grid that re-picks a round spacing (mm → km, in → mi) as you zoom, anchored to the area's corner
- [x] Dimension arrows, area label, collision-free object labels, locator rings for tiny objects
- [x] Pan/zoom: drag, wheel, trackpad & touch pinch, double-click, keyboard, zoom + fit buttons

### Phase 3 — 3D view ✅
- [x] three.js via the import map, lazy-loaded (prefetched on hover), WebGL fallback to 2D
- [x] Low-poly models for all 13 kinds built from primitives at real size (no model files);
      tests check every model stands on the ground and fits its w × h × d
- [x] Ground with a shader grid: powers of ten of 1 m / 1 ft, anchored to the area's corner,
      fading between levels so zooming never pops; horizon fades into fog
- [x] Objects stand in a row beside the area (`layout: 'side'`) so nothing blocks it
- [x] Camera framed from the actual footprint + objects; steeper on tall screens; fly-in on open
- [x] OrbitControls: drag to turn, right-drag / two fingers to pan along the ground, zoom to cursor,
      double-click to glide there, keyboard (arrows, + / −, 0), zoom + fit buttons
- [x] HTML labels (name + height or length), stacking, locator rings; legend names the grid squares
- [x] Soft shadows (rendered only when the scene changes), render-on-demand, pixel ratio ≤ 2,
      logarithmic depth so a phone and a city block render at the same time
- [x] Light/dark themes from CSS tokens; reduced-motion respected; full dispose on unmount

### Phase 4 — Content for every scale ✅
- [x] Six new objects so every scale has one: coin, cruise ship, Burj Khalifa, Golden Gate Bridge,
      Mount Fuji, the Moon (2D silhouettes + 3D models); a test sweeps spans from 2 cm to 50,000 km
- [x] The closest comparison is drawn to scale left of the area (2D and 3D); tap any comparison
      to switch, tap again to hide; the choice is part of the link (`c=tennis`, `c=none`)
- [x] Rectangles at official dimensions with their markings (tennis, basketball, soccer, football,
      pool lanes, bed pillows, Central Park's reservoir…)
- [x] Real outlines for Vatican City, Manhattan, Paris, Luxembourg, Belgium, the UK, Texas and the
      contiguous US (`tools/outlines.mjs` → `js/data/outlines.js`, scaled to the official areas)
- [x] Numbers from 10 million on read as words ("10.8 trillion ft²")

### Redesign & polish ✅
- [x] Area and sides always visible and linked (type either; a circle takes its diameter);
      changing the shape keeps the area; retyping a rectangle's area keeps its proportions
- [x] Bigger sticky stage with its own 2D/3D switch, display settings and full screen
      (real full screen, or a full-window stage where that isn't available, e.g. iPhone)
- [x] Display settings: theme (auto / light / dark), grid, measurements, labels, shadows, area colour
- [x] Dark mode is a night scene in 3D: starry sky, moonlight
- [x] 3D camera bar: angled, top, front and eye-level (1.65 m) views, turn left/right, spin;
      the picked view stays framed when the stage resizes
- [x] Objects card: sizes on every object, remove any, add from the catalog or your own
      (name + sizes); part of the link; "Reset to automatic"
- [x] Custom names are escaped everywhere they're shown (they arrive through links)
- [x] Settings and theme changes no longer reset the camera

### Round 3 ✅
- [x] Site-wide Metric / Imperial / Both switch in the header. Picking a system converts the size
      (same physical size, rounded to 4 digits); "Both" shows both systems side by side everywhere.
      Unit menus list only the chosen system's units; shared links open in the viewer's system.
- [x] Landmark comparisons are opt-in: nothing is drawn until a comparison is tapped; a picked one
      stays drawn (and listed) when the size changes
- [x] Size card leads with Width × length and shows the area as the result; shapes are
      Rectangle / Circle (equal sides make a square); quick picks anyone recognises, per system
- [x] Softer light theme: blue sky with clouds, sage ground. Night: Milky Way, moon, lit windows,
      car lights, the Eiffel Tower in gold

### 3D models from Poly Pizza ✅
- [x] 11 everyday objects use free models (Quaternius, Kenney: CC0; Poly by Google: CC-BY 3.0):
      person, dog, car, tree, bus, house, apartment block, airliner, chair, phone, coin
- [x] `tools/models.mjs` downloads them, keeps only the idle pose, recolours, and writes
      `assets/models/*.glb` + `js/data/models.js` (proportions + credits)
- [x] Each model is scaled evenly so its key measurement is exact (person 1.75 m tall, car 4.5 m
      long…); the other two sizes come from the model's own proportions
- [x] Loaded only when shown, cached; the built-in model stands in if a file can't load;
      windows and car lights glow at night
- [x] 2D uses pictures of the same models from above (`tools/topviews.html` → `assets/top/*.png`)
- [x] Credits listed in the footer, generated from the same data
- Landmarks (Eiffel Tower, Burj Khalifa, Golden Gate, Mount Fuji, stadium, Moon) and the cruise
  ship stay built-in: no free model was accurate enough at true scale

### Height ✅
- [x] Optional height on the size card ("Add height"): starts as a room (2.5 m / 8 ft), or as a
      cube on a small area (1 m² → 1 m³); has its own unit; shows the volume and how much water
      that is (liters / US gallons). In links as `h` + `hu`; converted with the measuring system.
- [x] 3D: the area becomes a see-through box (or cylinder) with solid edges and a height
      measurement at the front-left corner; the volume sits under the area label
- [x] 2D (seen from above): the height and volume are written under the area
- [x] "In other units" lists the volume in every volume unit
- [x] A tall, narrow box gets objects that suit its height (trees, houses) instead of its floor

### Languages ✅
- [x] English, Spanish, German, French, Italian, Portuguese (Brazil), Russian; picked from the
      browser on the first visit, switchable from the flag menu in the header, remembered
- [x] Everything translated: interface, unit names, object names, comparison phrases with each
      language's grammar (German cases, Russian number forms), Cyrillic unit symbols in Russian
- [x] Numbers in the local style (1.234,5 / 1 234,5); inputs accept the local decimal comma;
      links stay language-neutral
- [x] Tests check every language has every text and that every key used exists

### Polish before launch ✅
- [x] Language menu with little round flags (drawn as SVG: Windows can't show flag emoji)
- [x] Brighter 3D models: most were marked 40% metal, which only darkens them without reflections
- [x] New York City can be drawn (five boroughs from NYC City Planning); places that can be drawn
      show an outline icon, Earth's land area (the only one that can't) says why
- [x] Areas up to about twice the Earth's surface in any unit (was 10 billion of any unit, so
      large areas typed in m² were refused)
- [x] Long numbers shrink to fit their box instead of being cut off ("100000" showed as "1000")
- [x] The 3D height label moves along its line to stay clear of the other measurements
- [x] three.js served from the site itself; nothing is loaded from other sites (tested)
- [x] Checked: works from a sub-folder; shared links can't inject markup (tested with a crafted
      link); a sweep through every language, landmark and extreme size shows no errors

### Phase 5 — Ship
- [x] Favicon, theme-color, description + Open Graph text
- [ ] Open Graph image (needs the final URL)
- [ ] Optional: PWA / offline
- [ ] Lighthouse pass on a real phone, deploy (GitHub Pages or Netlify)

### Future (architecture already allows these)
- **Map overlay** — new `views/viewMap.js` (e.g. Leaflet + OpenStreetMap). The scene is
  already in meters, so it's just meters → lat/lng offsets around a dropped pin.
- **AR** — new `views/viewAR.js` with `isSupported` (WebXR on Android; `<model-viewer>`/Quick Look on iOS).
  The 3D models in `views/3d/models.js` can be reused as-is.
- **More languages** — copy `js/i18n/en.js`, translate, and add it to `LANGUAGES` in
  `js/i18n/index.js` (right-to-left scripts like Arabic would also need a mirrored layout).
- **More shapes** — add a case in `core/shapes.js`; views read `width`/`depth`/`radius`.

## Running

```
npm install     # once — only needed for the tests (installs three.js 0.160.0)
npm run dev     # serves on http://localhost:5173 (ES modules need http://, not file://)
npm test        # unit tests
```
