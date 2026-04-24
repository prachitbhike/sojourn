#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = Number.parseInt(process.env.SPRITE_PIPELINE_PORT ?? "8787", 10);
const PORT = Number.isFinite(DEFAULT_PORT) ? DEFAULT_PORT : 8787;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../");
const spritesDir = path.resolve(repoRoot, "packages/assets/sprites");

const metadataEntries = await loadSpriteMetadata();

if (metadataEntries.length === 0) {
  console.error("[mock-pipeline] No sprite metadata files found in", spritesDir);
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  try {
    setCorsHeaders(res);

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${PORT}`}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/sprites") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/sprites") {
      const body = await readBody(req);
      let prompt = "";
      try {
        const payload = body ? JSON.parse(body) : {};
        prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
      } catch (error) {
        console.warn("[mock-pipeline] Failed to parse JSON body", error);
      }

      const selection = selectSprite(prompt);
      const requestId = `mock-${Date.now().toString(36)}`;
      const response = {
        requestId,
        prompt,
        guidance: "Mock pipeline response. Replace with live Nano Banana integration when ready.",
        persona: {
          id: selection.personaId,
          displayName: selection.personaId
            .split("-")
            .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
            .join(" "),
          summary: `Generated from prompt: ${prompt || "(empty)"}`,
          archetype: selection.archetype,
          tone: [],
          guardrails: [],
          catchphrases: []
        },
        sprite: {
          url: new URL(`/assets/${selection.textureFile}`, `http://localhost:${PORT}`).toString(),
          metadata: selection.metadata
        }
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      const assetPath = safeJoin(spritesDir, url.pathname.replace("/assets/", ""));
      if (!assetPath) {
        res.writeHead(404);
        res.end();
        return;
      }

      const stream = fs.createReadStream(assetPath);
      stream.on("error", () => {
        res.writeHead(404);
        res.end();
      });
      res.writeHead(200, { "Content-Type": "image/png" });
      stream.pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    console.error("[mock-pipeline] Unexpected error", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, () => {
  console.log(`Mock sprite pipeline listening on http://localhost:${PORT}`);
});

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

async function loadSpriteMetadata() {
  const files = await readdir(spritesDir);
  const metadataFiles = files.filter((file) => file.endsWith(".json"));

  const entries = await Promise.all(
    metadataFiles.map(async (file) => {
      const metadataPath = path.join(spritesDir, file);
      const metadataRaw = await readFile(metadataPath, "utf8");
      const metadata = JSON.parse(metadataRaw);
      const textureFile = file.replace(/\.json$/u, ".png");
      return {
        metadata,
        textureFile,
        personaId: metadata.personaId ?? file.replace(/\.json$/u, ""),
        archetype: guessArchetype(metadata.personaId ?? "mentor")
      };
    })
  );

  return entries.filter((entry) => fs.existsSync(path.join(spritesDir, entry.textureFile)));
}

function guessArchetype(personaId) {
  if (personaId.includes("mentor")) {
    return "mentor";
  }
  if (personaId.includes("trickster")) {
    return "trickster";
  }
  if (personaId.includes("merchant")) {
    return "merchant";
  }
  return "mentor";
}

function selectSprite(prompt) {
  if (!prompt) {
    return metadataEntries[0];
  }

  const lower = prompt.toLowerCase();
  const match = metadataEntries.find((entry) => lower.includes(entry.archetype));
  return match ?? metadataEntries[Math.floor(Math.random() * metadataEntries.length)];
}

function safeJoin(rootDir, requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^\.\/+/, "");
  const fullPath = path.join(rootDir, normalized);
  if (!fullPath.startsWith(rootDir)) {
    return null;
  }
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fullPath;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", (error) => reject(error));
  });
}
