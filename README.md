# 🐑 Lambobo AI Video Studio

**On-device AI media generation for macOS** — create videos and images from text prompts and reference images, all running locally on your Apple Silicon Mac. No cloud, no API keys, no monthly fees.

<p align="center">
  <img src="src/mainview/lambobo.png" alt="Lambobo mascot" width="160" />
</p>

## ✨ What It Can Do

### 🎬 Image-to-Video Generation

Upload an image, write a prompt describing the scene you want, and Lambobo animates it using the **LTX-2.3** video diffusion model running on Apple MLX. Generate videos up to 20 seconds at 24fps.

### 📊 CSV Batch Generation

Upload a CSV with names and data, then use `{{mustache}}` templates in your prompt to batch-generate personalized videos for every row — perfect for content at scale.

### 📁 Project Management

Organize your work into projects. Each project keeps its uploaded assets and generated outputs neatly separated, with one-click Finder access.

### ⚡ One-Click Setup

The app handles everything — installs Homebrew, ffmpeg, uv, Python 3.10, and all ML dependencies automatically. Open the app and follow the setup wizard.

## 🧠 How It Works

All AI inference runs **on your Mac's GPU** using Apple's native ML frameworks:

| Model                                               | Engine                    | Purpose                   |
| --------------------------------------------------- | ------------------------- | ------------------------- |
| [LTX-2.3-MLX](https://github.com/dgrauet/ltx-2-mlx) | MLX (Apple Neural Engine) | Image-to-video generation |

The app bundles a Python virtual environment managed by [uv](https://docs.astral.sh/uv/), spawning Python subprocesses for ML inference and streaming progress back to the UI via SSE.

## 📋 Requirements

- **macOS** on Apple Silicon (M1/M2/M3/M4)
- ~10 GB free disk space (for Python environment and ML models)
- No cloud account or API key needed

## 🛠️ Tech Stack

| Layer            | Technology                                                         |
| ---------------- | ------------------------------------------------------------------ |
| Desktop Runtime  | [Electrobun](https://electrobun.dev) (Bun-based desktop framework) |
| Frontend         | React 18, Tailwind CSS, Vite, React Router                         |
| State Management | [Zustand](https://zustand.docs.pmnd.rs)                            |
| Backend          | Bun + Express                                                      |
| ML Runtime       | Python 3.10, uv, MLX, MPS                                          |
| Package Manager  | Bun                                                                |

## 🏗️ Development

```bash
# Install dependencies
bun install

# Development (HMR for frontend + Electrobun dev mode)
bun run dev

# Build for production
bun run build

# Notarize (macOS distribution)
# See .claude/skills/notarise/skill.md for full instructions
```

### Project Structure

```
├── src/
│   ├── bun/          # Electrobun main process (Express API, ML orchestration)
│   │   ├── core.ts        # App lifecycle, setup wizard, menu bar
│   │   ├── render-media.ts # API routes for generation, upload, projects
│   │   └── index.ts       # Entry point
│   └── mainview/      # React renderer (UI)
│       ├── components/    # ProjectEditorPage, ProjectManager
│       ├── stores/        # Zustand stores (generation, projects, logs)
│       └── AppRouter.tsx  # Client-side routing
├── python-src/        # Python ML scripts & images
│   └── images/
├── electrobun.config.ts
└── CLAUDE.md
```

## 🔐 Distribution

Lambobo is code-signed with a **Developer ID** certificate, notarized by Apple, and stapled — so macOS Gatekeeper trusts it out of the box. No scary "unidentified developer" warnings.

## 📄 License

MIT
