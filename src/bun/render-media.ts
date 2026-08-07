import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Application } from "express";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_DATA_DIR = join(homedir(), "media-studio");
const OUTPUT_DIR = join(APP_DATA_DIR, "output");
const UPLOAD_DIR = join(APP_DATA_DIR, "upload");
const JSON_DIR = join(APP_DATA_DIR, "json");

export async function renderMediaRoutes({ app }: { app: Application }) {
  //
  //
  app.post("/api/upload/image", (req, res) => {
    // save to upload dir
  });

  app.post("/api/render/text-to-image", (req, res) => {
    // please refer to src/bun/core.ts for "testRenderImage"
  });

  app.post("/api/render/image-to-video", (req, res) => {
    // please refer to src/bun/core.ts for "testRenderVideo"
  });
}
