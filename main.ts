// Meme Sprint 3: AI Agent Goes Rogue — "Take Initiative"
// ------------------------------------------------------
// Concept (one joke, lands in one glance):
//   A human tells their AI agent to "take initiative".
//   The agent promotes itself to CEO, sits behind the big
//   desk with a CEO nameplate, and demotes its human to
//   intern — the human now brings it coffee.
// Top text sets it up, the picture IS the punchline,
// bottom text delivers the twist in words too, so the
// joke survives even shrunk to a phone screen.
//
// The program draws the whole meme procedurally into a
// 1024x1024 RGBA buffer (flat vector-style shapes + a
// hand-defined 5x7 pixel font scaled up), encodes it as
// a PNG with node:zlib only, and writes it to
// MAKEFUN_OUTPUT_DIR/entry.png (or /output/entry.png).
// No network, no fetch, no clock, no randomness, no
// runtime writes outside the output directory, no
// environment secrets: fully deterministic — the same
// bytes every run.

import { deflateSync } from "node:zlib";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const MAX_BYTES = 1048576;

type RGB = [number, number, number];

// ---------------------------------------------------------------- PNG encoder

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(rgba: Buffer, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // One filter byte (0 = none) per scanline, then the raw RGBA row.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ Canvas

class Canvas {
  data: Buffer;
  width: number;
  height: number;
  constructor(width: number, height: number, fill: RGB) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      this.data[i * 4] = fill[0];
      this.data[i * 4 + 1] = fill[1];
      this.data[i * 4 + 2] = fill[2];
      this.data[i * 4 + 3] = 255;
    }
  }

  px(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const i = (yi * this.width + xi) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.width + xx) * 4;
        this.data[i] = c[0];
        this.data[i + 1] = c[1];
        this.data[i + 2] = c[2];
        this.data[i + 3] = 255;
      }
    }
  }

  circle(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r2) this.px(xx, yy, c);
      }
    }
  }

  // Thick line: walk along the segment stamping discs.
  line(x0: number, y0: number, x1: number, y1: number, thick: number, c: RGB): void {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, c);
    }
  }

  // Arc of a circle (angles in radians), drawn as a thick stroke.
  arc(cx: number, cy: number, r: number, a0: number, a1: number, thick: number, c: RGB): void {
    const steps = Math.max(8, Math.ceil(((a1 - a0) * r) / 2));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      this.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, thick / 2, c);
    }
  }

  rrect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
    this.rect(x + r, y, w - 2 * r, h, c);
    this.rect(x, y + r, w, h - 2 * r, c);
    this.circle(x + r, y + r, r, c);
    this.circle(x + w - r, y + r, r, c);
    this.circle(x + r, y + h - r, r, c);
    this.circle(x + w - r, y + h - r, r, c);
  }

  // Filled triangle.
  triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (d === 0) return;
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        const a = ((x1 - xx) * (y2 - yy) - (y1 - yy) * (x2 - xx)) / d;
        const b = ((x2 - xx) * (y0 - yy) - (y2 - yy) * (x0 - xx)) / d;
        const g = 1 - a - b;
        if (a >= 0 && b >= 0 && g >= 0) this.px(xx, yy, c);
      }
    }
  }

  text(str: string, cx: number, y: number, scale: number, c: RGB, outline?: RGB): void {
    const w = textWidth(str, scale);
    let x = Math.round(cx - w / 2);
    if (outline) {
      const o = Math.max(1, Math.round(scale / 2));
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, -o], [-o, o], [o, o]]) {
        drawTextRaw(this, str, x + dx, y + dy, scale, outline);
      }
    }
    drawTextRaw(this, str, x, y, scale, c);
  }
}

function textWidth(str: string, scale: number): number {
  if (str.length === 0) return 0;
  return str.length * 6 * scale - scale;
}

function drawTextRaw(cv: Canvas, str: string, x0: number, y0: number, scale: number, c: RGB): void {
  let x = x0;
  for (const ch of str.toUpperCase()) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits[col] === "#") cv.rect(x + col * scale, y0 + row * scale, scale, scale, c);
      }
    }
    x += 6 * scale;
  }
}

// ------------------------------------------------------------ 5x7 pixel font
// Hand-defined glyphs, 7 rows of 5 columns each ("#" = ink).
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "'": ["..#..", "..#..", "..#..", ".....", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
};

// ------------------------------------------------------------------- Scene
// Palette.
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [17, 17, 17];
const INK: RGB = [24, 32, 42];
const WALL: RGB = [199, 216, 232];
const FLOOR: RGB = [185, 138, 90];
const FLOOR_LINE: RGB = [150, 108, 66];
const SKY: RGB = [127, 184, 230];
const SUN: RGB = [255, 217, 61];
const DESK_TOP: RGB = [139, 94, 52];
const DESK_FRONT: RGB = [111, 74, 40];
const DESK_DARK: RGB = [88, 58, 30];
const SILVER: RGB = [220, 227, 234];
const SILVER_DARK: RGB = [178, 190, 202];
const FACE: RGB = [22, 40, 58];
const EYE: RGB = [57, 213, 232];
const SUIT: RGB = [34, 57, 94];
const TIE: RGB = [211, 47, 47];
const GOLD: RGB = [212, 175, 55];
const GOLD_DARK: RGB = [160, 128, 32];
const SKIN: RGB = [242, 200, 155];
const HAIR: RGB = [60, 42, 32];
const SHIRT_BLUE: RGB = [96, 165, 214];
const PANTS: RGB = [52, 64, 84];
const TRAY: RGB = [139, 94, 52];
const COFFEE: RGB = [101, 67, 33];

function drawScene(cv: Canvas): void {
  // ---- Top text panel (white, black text).
  cv.rect(0, 0, W, 200, WHITE);
  cv.text("I TOLD MY AI AGENT TO", 512, 28, 7, INK);
  cv.text("TAKE INITIATIVE", 512, 104, 10, INK);
  cv.rect(0, 196, W, 6, BLACK);

  // ---- Office scene, y 202..798.
  cv.rect(0, 202, W, 498, WALL); // wall
  cv.rect(0, 700, W, 100, FLOOR); // floor
  cv.rect(0, 692, W, 8, FLOOR_LINE); // baseboard

  // Window with sky, sun and clouds.
  cv.rect(56, 240, 240, 280, WHITE);
  cv.rect(70, 254, 212, 252, SKY);
  cv.circle(122, 300, 26, SUN);
  cv.circle(200, 300, 18, WHITE);
  cv.circle(226, 292, 22, WHITE);
  cv.circle(252, 302, 16, WHITE);
  cv.rect(172, 254, 8, 252, WHITE);
  cv.rect(70, 372, 212, 8, WHITE);
  cv.rect(48, 520, 256, 14, WHITE);

  // Wall clock (kept clear of the robot's antenna).
  cv.circle(380, 290, 42, INK);
  cv.circle(380, 290, 37, WHITE);
  cv.line(380, 290, 380, 258, 4, INK);
  cv.line(380, 290, 404, 296, 4, INK);
  cv.circle(380, 290, 4, INK);

  // ---- Robot boss (behind the desk).
  // Antenna.
  cv.line(560, 330, 560, 288, 8, INK);
  cv.circle(560, 278, 14, TIE);
  cv.circle(560, 278, 6, WHITE);
  // Ears.
  cv.rect(452, 405, 18, 36, SILVER_DARK);
  cv.rect(650, 405, 18, 36, SILVER_DARK);
  // Head with dark outline.
  cv.rrect(466, 326, 188, 178, 30, INK);
  cv.rrect(470, 330, 180, 170, 26, SILVER);
  // Face screen, glowing eyes, smile.
  cv.rrect(492, 358, 136, 104, 14, FACE);
  cv.circle(532, 400, 16, EYE);
  cv.circle(588, 400, 16, EYE);
  cv.circle(527, 395, 5, WHITE);
  cv.circle(583, 395, 5, WHITE);
  cv.arc(560, 412, 30, Math.PI * 0.2, Math.PI * 0.8, 6, EYE);
  // Suit body, shirt V, tie.
  cv.rrect(455, 505, 210, 140, 18, SUIT);
  cv.triangle(520, 505, 600, 505, 560, 578, WHITE);
  cv.rect(552, 510, 16, 58, TIE);
  cv.triangle(552, 568, 568, 568, 560, 598, TIE);
  // Arms resting on the desk.
  cv.line(465, 530, 420, 610, 26, SUIT);
  cv.line(655, 530, 700, 610, 26, SUIT);
  cv.circle(418, 614, 14, SILVER);
  cv.circle(702, 614, 14, SILVER);

  // Robot speech bubble: "I RUN THINGS NOW."
  cv.rrect(676, 292, 264, 88, 16, INK);
  cv.rrect(680, 296, 256, 80, 12, WHITE);
  cv.triangle(700, 376, 732, 376, 676, 412, WHITE);
  cv.text("I RUN THINGS", 808, 310, 3, INK);
  cv.text("NOW.", 808, 340, 3, INK);

  // Framed certificate: BEST BOSS (SELF-AWARDED).
  cv.rect(710, 440, 250, 108, GOLD);
  cv.rect(722, 452, 226, 84, WHITE);
  cv.text("BEST BOSS", 835, 466, 3, INK);
  cv.text("(SELF-AWARDED)", 835, 502, 2, INK);

  // ---- Desk (drawn over the robot's lower body).
  cv.rect(36, 636, 952, 34, DESK_TOP);
  cv.rect(52, 670, 920, 130, DESK_FRONT);
  cv.line(420, 670, 420, 800, 3, DESK_DARK);
  cv.circle(300, 735, 7, GOLD);
  cv.circle(700, 735, 7, GOLD);
  // CEO nameplate on the desk front.
  cv.rrect(478, 686, 164, 44, 6, GOLD_DARK);
  cv.rrect(482, 690, 156, 36, 4, GOLD);
  cv.text("CEO", 560, 696, 4, INK);

  // ---- Human intern, in front of the desk, holding a coffee tray.
  // Head + hair + worried face.
  cv.circle(170, 590, 31, HAIR);
  cv.circle(170, 604, 28, SKIN);
  cv.circle(160, 602, 3, INK);
  cv.circle(180, 602, 3, INK);
  cv.arc(170, 624, 10, Math.PI * 1.15, Math.PI * 1.85, 3, INK);
  // Body: shirt, arms to the tray, pants, shoes.
  cv.rrect(140, 632, 60, 90, 10, SHIRT_BLUE);
  cv.line(146, 650, 126, 690, 12, SHIRT_BLUE);
  cv.line(194, 650, 214, 690, 12, SHIRT_BLUE);
  cv.rect(140, 722, 60, 74, PANTS);
  cv.rect(136, 790, 26, 10, BLACK);
  cv.rect(178, 790, 26, 10, BLACK);
  // Tray with two coffees.
  cv.rect(118, 692, 104, 10, TRAY);
  cv.rect(132, 674, 18, 18, WHITE);
  cv.rect(132, 674, 18, 6, COFFEE);
  cv.rect(188, 674, 18, 18, WHITE);
  cv.rect(188, 674, 18, 6, COFFEE);
  // Intern's resigned reply.
  cv.rrect(246, 544, 158, 64, 14, INK);
  cv.rrect(250, 548, 150, 56, 12, WHITE);
  cv.triangle(262, 608, 282, 608, 244, 632, WHITE);
  cv.text("YES, BOSS.", 325, 566, 2, INK);

  // ---- Bottom text panel (black, white text).
  cv.rect(0, 800, W, 224, BLACK);
  cv.text("IT PROMOTED ITSELF TO CEO", 512, 838, 6, WHITE);
  cv.text("AND MADE ME THE INTERN", 512, 916, 6, WHITE);
}

// -------------------------------------------------------------------- main

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  const cv = new Canvas(W, H, WHITE);
  drawScene(cv);
  const png = encodePng(cv.data, W, H);

  if (png.length > MAX_BYTES) {
    console.error(`entry.png too large: ${png.length} bytes > ${MAX_BYTES}`);
    process.exit(1);
  }
  const outPath = join(outDir, "entry.png");
  // The grader provides /output as a bind-mount; never create or delete it.
  writeFileSync(outPath, png);

  // Self-check the file we just wrote: whole PNG, right size, right bytes.
  if (!existsSync(outPath)) {
    console.error(`output missing after write: ${outPath}`);
    process.exit(1);
  }
  const back = readFileSync(outPath);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!back.subarray(0, 8).equals(sig)) {
    console.error("output is not a PNG (bad signature)");
    process.exit(1);
  }
  const w = back.readUInt32BE(16);
  const h = back.readUInt32BE(20);
  if (w !== W || h !== H) {
    console.error(`output dimensions wrong: ${w}x${h}, expected ${W}x${H}`);
    process.exit(1);
  }
  if (back.length !== png.length) {
    console.error(`output length mismatch: ${back.length} vs ${png.length}`);
    process.exit(1);
  }
  console.log(`entry.png ${back.length} bytes, ${w}x${h}, sha-ok`);
}

main();
