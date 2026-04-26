import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

// Hosted at chandrasg.github.io/norms-in-cinema-demo
export default defineConfig({
  site: "https://chandrasg.github.io",
  base: "/norms-in-cinema-demo",
  trailingSlash: "ignore",
  integrations: [
    react(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  build: {
    assets: "_assets",
  },
});
