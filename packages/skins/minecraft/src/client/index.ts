/**
 * Minecraft skin — a voxel take on the dsh web GUI, styled after the
 * Minecraft main-menu panorama. apply() owns the whole surface and retracts
 * it on dispose (the ThemePresenter retraction discipline: the plugin only
 * ever removes what it wrote): the `data-dsh-minecraft` body attribute the
 * stylesheet is scoped on, the injected panorama skybox (a CSS 3-D cube
 * whose six faces are procedurally drawn pixel-art scenes — the Mojang
 * panorama itself is copyrighted, so every face is drawn here, block by
 * block), the dimming scrim, and the document title. The CSS rides the
 * bundle's CSS-modules auto-inject (style tag owned by the loader, removed
 * on entry dispose). No services are injected: the skin needs only the DOM.
 *
 * The skybox reproduces the main-menu motion: the camera sits inside a
 * cube and the whole cube slowly rotates around the Y axis, so the horizon
 * scrolls by. Each side face is a different 640x360 pixel scene (sky,
 * blocky sun, pixel clouds, stepped hills, blocky trees, grass blocks);
 * top and bottom are the sky and a grass-block field seen from above.
 */
import type { Context } from 'cordis'
import css from './minecraft.module.css'

/** The product title the skin pins (captured by the shell's DocumentTitle after settle). */
const SKIN_TITLE = 'Minecraft · DeepSeek 在线'

/** Resolve one module class name (fallback only satisfies the indexed-access type). */
const cls = (name: keyof typeof css): string => css[name] ?? ''

/* --- Pixel-art panorama scenes --------------------------------------------------
   One "pixel" is PX=8px in the 640x360 canvas. Ground line at y=280. */

const PX = 8
const GROUND = 280
const W = 640

/** One rect of the pixel scene. */
function r(x: number, y: number, w: number, h: number, fill: string, extra = ''): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`
}

/** A blocky cloud: three overlapping white slabs with a top cap. */
function cloud(x: number, y: number, s: number): string {
  const u = PX * s
  return [
    r(x, y + u, 3 * u, u, '#fdfdfd'),
    r(x + u, y, 2 * u, u, '#fdfdfd'),
    r(x + 3 * u, y + u, 2 * u, u, '#fdfdfd'),
    r(x + u, y + u, u, u, '#e6eef2'),
  ].join('')
}

/** A stepped blocky hill: layers shrink by two blocks every two rows. */
function hill(x: number, blocks: number, height: number, fill: string, cap?: string): string {
  let out = ''
  for (let i = 0; i < height; i++) {
    const w = Math.max(blocks - Math.floor(i / 2) * 2, 2)
    const color = i === height - 1 && cap ? cap : fill
    out += r(x + ((blocks - w) / 2) * PX, GROUND - (i + 1) * PX, w * PX, PX, color)
  }
  return out
}

/** A blocky tree: brown trunk, layered green crown. */
function tree(x: number, scale = 1): string {
  const u = PX * scale
  return [
    r(x + u, GROUND - 3 * u, 2 * u, 3 * u, '#6b4a2b'),
    r(x, GROUND - 6 * u, 4 * u, 3 * u, '#3f8f3f'),
    r(x + u, GROUND - 7 * u, 2 * u, u, '#2f7a2f'),
  ].join('')
}

/** A tiny flower dot sitting on the grass edge. */
function flower(x: number, y: number, fill: string): string {
  return r(x, y, 4, 4, fill)
}

/** The shared grass-block ground strip. */
function ground(): string {
  let tufts = ''
  for (let x = 8; x < W; x += 32) tufts += r(x, GROUND + PX, PX, PX, '#6faf42')
  return [
    r(0, GROUND, W, PX, '#7cbd4b'),
    r(0, GROUND + PX, W, 80 - PX, '#8a5a32'),
    tufts,
  ].join('')
}

interface Face {
  sun?: readonly [number, number]
  clouds?: readonly (readonly [number, number, number])[]
  hills?: readonly (readonly [number, number, number, string])[]
  caps?: number[]
  trees?: readonly (readonly [number, number])[]
  flowers?: readonly (readonly [number, number, string])[]
}

/** Render one side-face scene (640x360). */
function panoSvg(face: Face): string {
  let body = ''
  // Sky: bright daytime gradient, pale near the horizon.
  body += r(0, 0, W, GROUND, "url(#sky)")
  if (face.sun) {
    const [sx, sy] = face.sun
    body += r(sx - 12, sy - 12, 36, 36, 'rgba(255,255,255,0.35)')
    body += r(sx, sy, 12, 12, '#ffffff')
  }
  for (const [x, y, s] of face.clouds ?? []) body += cloud(x, y, s)
  for (const [i, [x, b, h, fill]] of (face.hills ?? []).entries()) {
    const cap = face.caps?.includes(i) ? '#dfeaf2' : undefined
    body += hill(x, b, h, fill, cap)
  }
  for (const [x, s] of face.trees ?? []) body += tree(x, s)
  for (const [x, y, fill] of face.flowers ?? []) body += flower(x, y, fill)
  body += ground()
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 360" shape-rendering="crispEdges">` +
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#8fd0f5"/><stop offset="0.62" stop-color="#b7e2fa"/>` +
    `<stop offset="1" stop-color="#eef8fd"/>` +
    `</linearGradient></defs>${body}</svg>`
  )
}

/** Top face: open sky with a couple of clouds (512x512). */
function topSvg(): string {
  const sky = r(0, 0, 512, 512, "url(#t)")
  const c1 = cloud(96, 160, 2)
  const c2 = cloud(280, 300, 2)
  const c3 = cloud(200, 60, 1)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">` +
    `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#7ec3ee"/><stop offset="1" stop-color="#a9dcf7"/>` +
    `</linearGradient></defs>${sky}${c1}${c2}${c3}</svg>`
  )
}

/** Bottom face: grass block field seen from above (512x512). */
function bottomSvg(): string {
  let cells = ''
  for (let gx = 0; gx < 512; gx += 64) {
    for (let gy = 0; gy < 512; gy += 64) {
      const dark = (gx / 64 + gy / 64) % 3 === 0
      cells += r(gx + 16, gy + 16, 16, 16, dark ? '#6faf42' : '#86c95a')
      cells += r(gx + 40, gy + 40, 8, 8, dark ? '#86c95a' : '#6faf42')
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">` +
    `<rect width="512" height="512" fill="#7cbd4b"/>${cells}</svg>`
  )
}

/** The four distinct horizon scenes (Mojang's panorama has six, ours has four sides). */
const FACES: Face[] = [
  {
    sun: [120, 64],
    clouds: [[300, 90, 1], [470, 150, 1]],
    hills: [[60, 12, 9, '#8fa8b8'], [380, 16, 11, '#8fa8b8']],
    caps: [1],
    trees: [[540, 1], [150, 1]],
    flowers: [[280, 1, '#f5d442']],
  },
  {
    sun: [480, 90],
    clouds: [[80, 120, 1], [250, 70, 2], [520, 170, 1]],
    hills: [[30, 10, 7, '#93aabb'], [260, 14, 10, '#7d95a5'], [500, 12, 8, '#93aabb']],
    trees: [[140, 2], [420, 1], [560, 1]],
    flowers: [[220, 1, '#e05656'], [360, 1, '#f5d442']],
  },
  {
    sun: [80, 130],
    clouds: [[360, 90, 2], [560, 60, 1]],
    hills: [[150, 18, 13, '#75899a'], [480, 14, 9, '#8fa8b8']],
    caps: [0],
    trees: [[60, 1], [300, 1], [430, 2], [600, 1]],
  },
  {
    sun: [340, 70],
    clouds: [[90, 80, 1], [200, 160, 2], [500, 120, 1]],
    hills: [[40, 14, 10, '#7d95a5'], [220, 12, 8, '#8fa8b8'], [560, 16, 11, '#7d95a5']],
    caps: [2],
    trees: [[330, 1], [480, 1]],
    flowers: [[120, 1, '#f5d442'], [400, 1, '#e05656']],
  },
]

/** One panorama face as a data-URI background image. */
function faceImage(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
}

/* --- apply ---------------------------------------------------------------------- */

/**
 * Apply the Minecraft skin: body attribute, panorama skybox (stage + cube
 * of six faces + dimming scrim), title. All writes are retracted by the
 * effect disposer on dispose.
 * @param ctx - owning context (the effect lifecycle owns retraction).
 */
export function apply(ctx: Context): void {
  const body = document.body
  const originalTitle = document.title
  body.setAttribute('data-dsh-minecraft', '')

  const stage = document.createElement('div')
  stage.className = cls('mcStage')
  const skybox = document.createElement('div')
  skybox.className = cls('mcSkybox')
  const sideSvg = FACES.map(panoSvg)
  const sideNames = ['front', 'back', 'left', 'right']
  for (let i = 0; i < 6; i++) {
    const face = document.createElement('div')
    face.className = `${cls('mcFace')} ${cls(i < 4 ? `mcFace${i + 1}` : i === 4 ? 'mcFaceTop' : 'mcFaceBottom')}`
    face.style.backgroundImage = faceImage(i < 4 ? sideSvg[i] : i === 4 ? topSvg() : bottomSvg())
    // data-skin-chrome marks every injected element for the apply spec.
    face.dataset.skinChrome = `face-${sideNames[i] ?? (i === 4 ? 'top' : 'bottom')}`
    skybox.append(face)
  }
  stage.append(skybox)

  const scrim = document.createElement('div')
  scrim.className = cls('mcScrim')
  scrim.dataset.skinChrome = 'scrim'
  stage.dataset.skinChrome = 'stage'

  document.title = SKIN_TITLE
  body.append(stage, scrim)

  ctx.effect(() => () => {
    body.removeAttribute('data-dsh-minecraft')
    stage.remove()
    scrim.remove()
    // Only restore when the skin's own title still stands — a session title
    // projected by the shell must not be clobbered by skin teardown.
    if (document.title === SKIN_TITLE) document.title = originalTitle
  }, 'ui-skin-minecraft: panorama skybox')
}
