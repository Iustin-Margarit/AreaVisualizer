
# AreaVisualizer

See how big an area really is. Type width × length (or the area in m², ft², acres, hectares,
km², mi²) and see it to scale next to a person, a car, a tree, a house — up to the Eiffel Tower,
Mount Fuji and the Moon — and next to famous places (a tennis court, Central Park, Belgium,
Texas…), in 2D or 3D.

- Add a height to turn the area into a room or a box and get its volume (m³, liters, ft³, gallons).
- Add or remove objects, including your own ("Sofa, 2 × 0.9 × 0.8 m").
- Metric, imperial, or both side by side.
- In English, Spanish, German, French, Italian, Portuguese, Romanian and Russian (follows the browser; switch with the flag menu).
- 3D camera views: angled, top, front, eye level; full screen (with a menu to change the size and
  objects without leaving it); a cloudy blue-sky day and a night
  mode with the Milky Way and the moon. On phones: drag, pinch, twist to turn, double tap to zoom in.
- Works on phones and computers, no sign-up, no tracking, no backend.
- Every view is a link: share it and others see exactly the same thing.
- Plain HTML/CSS/JS, no build step. The 3D view uses [three.js](https://threejs.org) (a copy in
  `vendor/`, loaded only when you open 3D). The page loads nothing from other sites.

## Run it locally

ES modules need to be served over `http://` (opening `index.html` from disk won't work):

```sh
npm run dev            # or: python -m http.server 5173
```

Then open [http://localhost:5173](http://localhost:5173).

## Tests

```sh
npm install            # once: installs three.js for the 3D model tests
npm test
```

## 3D models

Everyday objects use free models from [Poly Pizza](https://poly.pizza) — by Quaternius and Kenney
(CC0) and Poly by Google (CC-BY 3.0); the full list with links is in the page footer. To
re-download or swap them, edit the list in `tools/models.mjs`, then:

```sh
node tools/models.mjs        # → assets/models/*.glb and js/data/models.js
npm run dev                  # then open http://localhost:5173/tools/topviews.html
                             # and save each picture into assets/top/
```

## Moon photo

The moon in the 3D night sky (`assets/moon.webp`) is NASA's Lunar Reconnaissance Orbiter photo of
its near side ([NASA/GSFC/Arizona State University](https://commons.wikimedia.org/wiki/File:Moon_nearside_LRO.jpg),
public domain), cropped, brightened and cut to a circle.

## Landmark outlines

The country, state and city outlines in `js/data/outlines.js` are generated:

```sh
node tools/outlines.mjs
```

Countries come from [Natural Earth](https://www.naturalearthdata.com) (via world-atlas), Texas from
the US Census (via us-atlas) — both public domain — and New York City's boroughs from the NYC
Department of City Planning. Manhattan, Paris and Vatican City are hand-traced.

## Deploy

Live at [areavisualizer.vercel.app](https://areavisualizer.vercel.app). Vercel deploys every push
to `main`; other branches get their own preview link. `.vercelignore` keeps tests, tools and notes
off the site.

It's a static site with no server code, so any web host works too. All paths are relative, so it
also works from a sub-folder. `node_modules/` is only for tests and tools (it's in `.gitignore`);
`.nojekyll` tells GitHub Pages to serve the files as they are.

## Updating three.js

The site serves its own copy of three.js (so no third party sees who visits). To update it,
change the version in `package.json`, then:

```sh
npm install
node tools/vendor.mjs        # copies the files the site uses into vendor/three/
npm test                     # also checks vendor/ matches the installed version
```

## Font

[Geist](https://vercel.com/font) by Vercel, SIL Open Font Licence (`assets/fonts/Geist-LICENSE.txt`),
served from this site.

## How it's built

`js/core/` is the pure logic (units, shapes, the scene model), `js/ui/` the controls, and
`js/views/` the 2D and 3D views. Adding a view (a map overlay, AR) is one new file plus one line in
`js/views/registry.js`.
