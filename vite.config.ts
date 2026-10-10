import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/httpsms": {
        target: "https://api.httpsms.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/httpsms/, ""),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "apple-touch-icon.png", "logo-icon.png", "logo.png", "robots.txt"],
      manifest: {
        name: "DR.BAYNIYAZOV — Stomatologiya Klinikasi",
        short_name: "DR.BAYNIYAZOV",
        description: "DR.BAYNIYAZOV stomatologiya klinikasi elektron qabul va tibbiy karta tizimi",
        theme_color: "#0d9488",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "landscape-primary",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
