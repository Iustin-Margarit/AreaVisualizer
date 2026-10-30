---
name: ui-redesign
description: Redesign the AreaVisualizer UI on the ui-redesign branch using the user's example images in design-refs/. Use when the user asks to change the look, layout, colours, fonts or style of the website.
---

# UI redesign workflow

The user is new to coding and watches token use: explain plainly, one step at a time, keep replies short.

## 0. Set up
- Work only on branch `ui-redesign` (or a `ui-redesign-<name>` branch for an alternative design). Check `git branch --show-current`; never edit `main`. Don't commit unless asked; the user pushes with GitHub Desktop, and Vercel then gives the branch its own preview URL.
- Read CLAUDE.md rules first (no build step, i18n in all 8 languages, colours as CSS variables, nothing loaded from other sites, generated files are off-limits).

## 1. Gather the brief
- Look at every image in `design-refs/` (Read tool shows images) and `design-refs/notes.txt` if present.
- Summarise in ≤6 bullets: palette, type style, spacing/density, shape language (corners, shadows, borders), layout ideas, what to avoid. Ask at most 2 questions, and only if the images don't answer them (e.g. which part of the site to change).

## 2. Plan small
- Prefer changing CSS variables and `css/styles.css` first; touch `index.html` and `js/ui/*` only for layout/markup changes.
- Fonts and icons must be local files (e.g. in `assets/fonts/`), never a CDN or Google Fonts. Prefer system font stacks.
- Keep the light + `[data-mode="dark"]` themes both working; the 3D scene reads the CSS variables.
- New or changed visible text: add the key to `js/i18n/en.js` and all 8 languages.
- Keep in index.html: google-site-verification meta, canonical/og tags, 3D model credits.
- Check at ~411 px wide with large text, and at desktop width.

## 3. Build and verify
- `npm run dev` (http://localhost:5173), then `npm test` after every change.
- Take headless Chrome screenshots (`--use-angle=swiftshader` for 3D; one Chrome at a time) of desktop and 411 px, light and dark. Save them to the scratchpad, view them, and compare against the reference images before showing the user.

## 4. Hand over
- Say what changed, which files, and what to look at (give the localhost link and the phone link http://192.168.100.42:5173).
- Offer alternatives as separate branches rather than overwriting a design the user liked.
- Tell the user the exact GitHub Desktop clicks to commit and push the branch to get the preview URL when they ask.
