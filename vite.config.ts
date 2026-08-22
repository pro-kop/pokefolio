import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages běží na https://pro-kop.github.io/pokefolio/ ,
// takže všechny cesty musí být relativní k /pokefolio/.
export default defineConfig({
  base: "/pokefolio/",
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
});
