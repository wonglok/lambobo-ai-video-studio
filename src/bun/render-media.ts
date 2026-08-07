import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Application } from "express";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const APP_DATA_DIR = join(homedir(), "media-studio");
const OUTPUT_DIR = join(APP_DATA_DIR, "output");
const UPLOAD_DIR = join(APP_DATA_DIR, "upload");
const JSON_DIR = join(APP_DATA_DIR, "json");
const PROJECTS_FILE = join(JSON_DIR, "projects.json");

// ========== Project Types ==========

export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ========== Project Helpers ==========

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function readProjects(): Project[] {
  ensureDir(JSON_DIR);
  if (!existsSync(PROJECTS_FILE)) {
    writeFileSync(PROJECTS_FILE, "[]", "utf-8");
    return [];
  }
  try {
    const raw = readFileSync(PROJECTS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeProjects(projects: Project[]) {
  ensureDir(JSON_DIR);
  writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), "utf-8");
}

function makeId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function openInFinder(dirPath: string) {
  execFileSync("open", [dirPath]);
}

// ========== Routes ==========

export async function renderMediaRoutes({ app }: { app: Application }) {
  //
  // ========== Upload ==========

  app.post("/api/upload/image", (_req, _res) => {
    // save to upload dir
  });

  // ========== Render ==========

  app.post("/api/render/text-to-image", (_req, _res) => {
    // please refer to src/bun/core.ts for "testRenderImage"
  });

  app.post("/api/render/image-to-video", (_req, _res) => {
    // please refer to src/bun/core.ts for "testRenderVideo"
  });

  // ========== Project CRUD ==========

  // List all projects
  app.get("/api/projects", (_req, res) => {
    const projects = readProjects();
    res.json(projects);
  });

  // Get single project
  app.get("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(project);
  });

  // Create project
  app.post("/api/projects", (req, res) => {
    const { name, description } = req.body || {};
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    const projects = readProjects();
    const now = new Date().toISOString();
    const project: Project = {
      id: makeId(),
      name: String(name),
      description: String(description || ""),
      createdAt: now,
      updatedAt: now,
    };

    // Create project folders
    ensureDir(join(UPLOAD_DIR, project.id));
    ensureDir(join(OUTPUT_DIR, project.id));

    projects.push(project);
    writeProjects(projects);

    res.status(201).json(project);
  });

  // Update project
  app.put("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { name, description } = req.body || {};
    if (name !== undefined) projects[index].name = String(name);
    if (description !== undefined) projects[index].description = String(description);
    projects[index].updatedAt = new Date().toISOString();

    writeProjects(projects);
    res.json(projects[index]);
  });

  // Delete project
  app.delete("/api/projects/:id", (req, res) => {
    const projects = readProjects();
    const index = projects.findIndex((p) => p.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [removed] = projects.splice(index, 1);
    writeProjects(projects);
    res.json(removed);
  });

  // Open project folder in Finder
  app.post("/api/projects/:id/open-folder", (req, res) => {
    const { type } = req.body || {};
    const projects = readProjects();
    const project = projects.find((p) => p.id === req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    let targetPath: string;
    switch (type) {
      case "upload":
        targetPath = join(UPLOAD_DIR, project.id);
        break;
      case "output":
        targetPath = join(OUTPUT_DIR, project.id);
        break;
      default:
        targetPath = join(OUTPUT_DIR, project.id);
    }

    ensureDir(targetPath);
    try {
      openInFinder(targetPath);
      res.json({ success: true, path: targetPath });
    } catch (e) {
      res.status(500).json({ error: "Failed to open folder", details: String(e) });
    }
  });

  // Open project in Finder (root project folder - opens output dir)
  app.post("/api/projects/:id/open-in-finder", (_req, res) => {
    const projects = readProjects();
    const project = projects.find((p) => p.id === _req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const projectOutputDir = join(OUTPUT_DIR, project.id);
    ensureDir(projectOutputDir);
    try {
      openInFinder(projectOutputDir);
      res.json({ success: true, path: projectOutputDir });
    } catch (e) {
      res.status(500).json({ error: "Failed to open in Finder", details: String(e) });
    }
  });
}
