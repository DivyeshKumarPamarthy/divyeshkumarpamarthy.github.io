# divyeshkumarpamarthy.github.io

Portfolio of **Divyesh Kumar Pamarthy**, live at <https://divyeshkumarpamarthy.github.io/>.

The site opens on a scrambled Rubik's cube. Scrolling plays the solving moves one by one (scrolling up scrambles it again). Once it is solved, the cube glides into the hero section and the portfolio takes over.

## What's where

| Path | What it is |
| --- | --- |
| `index.html` | The portfolio. All text content lives here: edit it directly, no build needed. |
| `resume.html` | The one-page A4 résumé (print-ready), with a toolbar to go back, print or download. |
| `404.html` | "This page got scrambled" page for broken links. |
| `assets/css/style.css` | All styles. Colours are CSS variables at the top (`--c-white`, `--c-red`, …). |
| `assets/js/main.js` | **Built** bundle (three.js + the cube). Don't edit by hand; rebuild from `src/`. |
| `src/cube.js` | Cube model: moves, notation, scramble, cube state, the 3D cubies, confetti. |
| `src/experience.js` | Scroll-to-solve logic, docking into the hero, drag-to-spin, render loop. |
| `src/hud.js` | Intro overlay: move ticker, live cube net, stage text, decoding name. |
| `src/ui.js` | Nav, reveal-on-scroll, counters, copy email, mobile menu. |
| `assets/resume/…pdf` | Résumé PDF served by the "Résumé" buttons. |
| `assets/img/` | Favicon, social preview image (`og-image.png`), fallback cube image. |
| `assets/fonts/` | Self-hosted fonts (Bricolage Grotesque, Inter, JetBrains Mono, Lora). |

## Editing

- **Text, projects, links:** edit `index.html` and push. GitHub Pages redeploys in about a minute.
- **The cube / intro code:** edit files in `src/`, then rebuild:

  ```bash
  npm install
  npm run build     # writes assets/js/main.js
  npm run serve     # http://localhost:8080
  ```

- **Résumé:** edit `resume.html`, open it in Chrome, Print → Save as PDF (A4, margins "None", background graphics on), and replace `assets/resume/Divyesh-Kumar-Pamarthy-Resume.pdf`.

## Handy URL flags (for testing)

- `?seed=42`: use a fixed scramble instead of a random one.
- `?nogl`: skip WebGL and show the static fallback.
- `?instant`: no smoothing between scroll position and cube (useful for screenshots).

## Accessibility & fallbacks

- "Skip intro" button and a keyboard skip link jump straight to the content.
- `prefers-reduced-motion`: the intro is skipped and the cube is shown solved.
- No JavaScript or no WebGL: the page renders as a normal portfolio with a static cube image.

## Credits

Built with [three.js](https://threejs.org/) (MIT). Fonts are under the SIL Open Font License.
