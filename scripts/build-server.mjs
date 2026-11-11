import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  packages: "external",
  format: "esm",
  outfile: "dist-server/index.js",
  define: { "process.env.SERVE_BUILD": '"true"' },
});
