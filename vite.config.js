import {defineConfig} from "vite";

// Relative paths allow deployment at the root or /hp/ on GitHub Pages.
export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {outDir: "dist", emptyOutDir: true},
});
