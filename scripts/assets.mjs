import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
await mkdir("public/images", { recursive: true });
await mkdir("public/fonts", { recursive: true });
const photos = [
  "photo-1504307651254-35680f356dfd",
  "photo-1486262715619-67b85e0b08d3",
  "photo-1560066984-138dadb4c035",
  "photo-1441986300917-64674bd600d8",
  "photo-1452860606245-08befc0ff44b",
  "photo-1497366754035-f200968a6e72",
  "photo-1454165804606-c3d57bc86b40",
  "photo-1416879595882-3373a0480b5b",
  "photo-1621905251189-08b45d6a269e",
  "photo-1497366811353-6870744d04b2",
];
for (let i = 0; i < photos.length; i++) {
  const r = await fetch(
    `https://images.unsplash.com/${photos[i]}?auto=format&fit=crop&w=700&q=80`,
  );
  if (!r.ok) throw new Error(`Foto ${i}: ${r.status}`);
  await writeFile(
    `public/images/area-${i}.jpg`,
    Buffer.from(await r.arrayBuffer()),
  );
  console.log(`Foto ${i} salva`);
}
for (const [name, family] of [
  ["dm-sans", "DM+Sans"],
  ["manrope", "Manrope"],
]) {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${family}:wght@200..800&display=swap`,
      { headers: { "user-agent": "Mozilla/5.0" } },
    )
  ).text();
  const url = [...css.matchAll(/url\((https:[^)]+)\)/g)].at(-1)?.[1];
  if (!url) throw new Error("Fonte ausente");
  const r = await fetch(url);
  await writeFile(
    `public/fonts/${name}.ttf`,
    Buffer.from(await r.arrayBuffer()),
  );
  console.log(`Fonte ${name} salva`);
}
function crc32(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    size = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([size, t, data, crc]);
}
for (const size of [192, 512]) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let col = [65, 69, 183, 255];
      const u = x / size,
        v = y / size;
      for (const [l, t, r, b] of [
        [0.28, 0.55, 0.39, 0.72],
        [0.445, 0.42, 0.555, 0.72],
        [0.61, 0.28, 0.72, 0.72],
      ])
        if (u >= l && u < r && v >= t && v < b) col = [255, 255, 255, 255];
      const p = y * (size * 4 + 1) + 1 + x * 4;
      rows.set(col, p);
    }
  const h = Buffer.alloc(13);
  h.writeUInt32BE(size);
  h.writeUInt32BE(size, 4);
  h[8] = 8;
  h[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", h),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  await writeFile(`public/icon-${size}.png`, png);
  if (size === 512) await writeFile("public/icon-maskable.png", png);
}
