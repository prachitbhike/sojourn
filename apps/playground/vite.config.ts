import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@npc-creator/types": path.resolve(__dirname, "../../packages/types/src"),
      "@npc-creator/personas": path.resolve(__dirname, "../../packages/personas/src"),
      "@npc-creator/dialogue": path.resolve(__dirname, "../../packages/dialogue/src"),
      "@npc-creator/phaser-runtime": path.resolve(__dirname, "../../packages/phaser-runtime/src"),
      "@npc-creator/voice": path.resolve(__dirname, "../../packages/voice/src")
    }
  },
  server: {
    port: 5173
  }
});
