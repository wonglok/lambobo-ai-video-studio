import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { type Subprocess, spawn } from "bun";
import Electrobun, {
  BrowserWindow,
  // type RPCSchema,
  // Utils,
  Updater,
} from "electrobun/bun";
import { homedir } from "node:os";
import express from "express";
import cors from "cors";
import { renderMediaRoutes } from "./render-media";
import { readdir } from "node:fs/promises";
import { rename } from "node:fs/promises";
// import { execSync } from "node:child_process";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if Vite dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
  }
  return "views://mainview/index.html";
}

// App configuration
// const APP_NAME = "Media Studio by loklok";
const APP_DATA_DIR = join(homedir(), "media-studio");
const PYTHON_DIR = join(APP_DATA_DIR, "python-src");
const OUTPUT_DIR = join(APP_DATA_DIR, "output");
const UPLOAD_DIR = join(APP_DATA_DIR, "upload");
const JSON_DIR = join(APP_DATA_DIR, "json");
const BACKEND_PORT_START = 8765;
let BACKEND_PORT = BACKEND_PORT_START;

//

// Setup state
interface SetupState {
  port: string;
  uvInstalled: boolean;
  pythonInstalled: boolean;
  depsInstalled: boolean;
  backendRunning: boolean;
  imageTestRendered: boolean;
  imageEditTestRendered: boolean;
  videoTestRendered: boolean;
  qwenImageTestRendered: boolean;
  allOK: boolean;
  error?: string;
}

let setupState: SetupState = {
  imageEditTestRendered: false,
  qwenImageTestRendered: false,
  port: "",
  uvInstalled: false,
  pythonInstalled: false,
  depsInstalled: false,
  backendRunning: false,
  imageTestRendered: false,
  videoTestRendered: false,
  allOK: false,
  error: "",
};

export async function runSetup({}: {}): Promise<SetupState> {
  [APP_DATA_DIR, PYTHON_DIR, OUTPUT_DIR, JSON_DIR, UPLOAD_DIR].forEach(
    (dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    },
  );

  BACKEND_PORT = await findFreePort(BACKEND_PORT_START);

  // Create the main application window
  const url = await getMainViewUrl();

  // In your Bun main process

  const mainWindow = new BrowserWindow({
    //
    preload: `
      window.PORT = ${BACKEND_PORT};
      PORT = ${BACKEND_PORT};
    `,
    title: "Media Studio",
    url: `${url}`,
    frame: {
      width: 900,
      height: 700,
      x: 200,
      y: 200,
    },
  });

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "100gb" }));
  app.get("/api/hi", (req, res) => {
    res.json({ hi: "hi" });
  });

  app.get("/api/setup", async (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Helper to run a step and send progress
    const runStep = async (
      step: string,
      label: string,
      fn: () => Promise<boolean>,
    ): Promise<boolean> => {
      send("progress", { step, status: "running", label });
      try {
        const ok = await fn();
        if (ok) {
          send("progress", { step, status: "completed", label });
        } else {
          send("progress", { step, status: "error", label });
        }
        return ok;
      } catch (e) {
        send("progress", {
          step,
          status: "error",
          label,
          error: String(e),
        });
        return false;
      }
    };

    // Reset state
    setupState = {
      port: `${BACKEND_PORT}`,
      uvInstalled: false,
      pythonInstalled: false,
      depsInstalled: false,
      backendRunning: false,
      imageTestRendered: false,
      imageEditTestRendered: false,
      videoTestRendered: false,
      qwenImageTestRendered: false,
      error: "",
      allOK: false,
    };

    send("progress", {
      step: "init",
      status: "running",
      label: "Running setup...",
    });

    // Step 1: Check/install uv
    setupState.uvInstalled = await checkUvInstalled();
    if (!setupState.uvInstalled) {
      setupState.uvInstalled = await runStep(
        "uv",
        "Installing uv package manager...",
        installUv,
      );
      if (!setupState.uvInstalled) {
        setupState.error = "Failed to install uv package manager";
        send("error", { error: setupState.error });
        res.end();
        return;
      }
    } else {
      send("progress", {
        step: "uv",
        status: "completed",
        label: "uv package manager found",
      });
    }

    // Step 2: Setup Python environment
    setupState.pythonInstalled = await runStep(
      "python",
      "Setting up Python environment...",
      setupPythonEnvironment,
    );
    if (!setupState.pythonInstalled) {
      setupState.error = "Failed to setup Python environment";
      send("error", { error: setupState.error });
      res.end();
      return;
    }

    // Step 3: Install Python dependencies
    setupState.depsInstalled = await runStep(
      "deps",
      "Installing Python dependencies...",
      installPythonDependencies,
    );
    if (!setupState.depsInstalled) {
      setupState.error = "Failed to install Python dependencies";
      send("error", { error: setupState.error });
      res.end();
      return;
    }

    // Step 4: Test render image
    setupState.imageTestRendered = await runStep(
      "render-image",
      "Rendering test image...",
      async () => testRenderImage({ send }),
    );
    if (!setupState.imageTestRendered) {
      // Non-fatal: continue with video render
      console.warn("Test image render failed, continuing...");
    }

    // Step 5: Test render video
    setupState.videoTestRendered = await runStep(
      "render-video",
      "Rendering test video...",
      async () => testRenderVideo({ send }),
    );
    if (!setupState.videoTestRendered) {
      // Non-fatal: still mark setup as complete
      console.warn("Test video render failed, continuing...");
    }

    // // Step 7: Test qwen image generation
    // setupState.qwenImageTestRendered = await runStep(
    //   "qwen-image",
    //   "Processing qwen image generation task...",
    //   async () => testQwenImageGeneration({ send }),
    // );
    // if (!setupState.qwenImageTestRendered) {
    //   console.warn("Test qwen image generation failed, continuing...");
    // }

    // // Step 6: Test edit image
    // setupState.imageEditTestRendered = await runStep(
    //   "edit-image",
    //   "Processing image editing task...",
    //   async () => testQwenImageEditGeneration({ send }),
    // );
    // if (!setupState.imageEditTestRendered) {
    //   // Non-fatal: still mark setup as complete
    //   console.warn("Test image edit failed, continuing...");
    // }

    setupState.allOK = true;
    send("complete", { success: true, port: BACKEND_PORT });
    res.end();
  });

  renderMediaRoutes({ app, getUvPath });
  //
  //
  //
  //
  //

  app.listen(BACKEND_PORT);

  return setupState;
}

async function findFreePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 100; port++) {
    try {
      const server = Bun.listen({
        hostname: "127.0.0.1",
        port,
        socket: {
          data() {},
        },
      });
      server.stop();
      return port;
    } catch {
      // Port in use, try next
    }
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + 99}`);
}

// ========== Utility Functions ==========

async function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<{ success: boolean; output: string; error: string }> {
  try {
    const proc = spawn([command, ...args], {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env } as any,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: output.trim(),
      error: error.trim(),
    };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: String(e),
    };
  }
}

async function checkCommand(command: string): Promise<boolean> {
  const result = await runCommand("which", [command]);
  return result.success;
}

// ========== Setup Functions ==========

async function checkUvInstalled(): Promise<boolean> {
  if (await checkCommand("uv")) {
    return true;
  }

  const uvPaths = [
    join(homedir(), ".local", "bin", "uv"),
    join(homedir(), ".cargo", "bin", "uv"),
    "/usr/local/bin/uv",
  ];

  for (const path of uvPaths) {
    if (existsSync(path)) {
      return true;
    }
  }

  return false;
}

async function installUv(): Promise<boolean> {
  console.log("Installing uv...");

  const result = await runCommand("sh", [
    "-c",
    "curl -LsSf https://astral.sh/uv/install.sh | sh",
  ]);

  if (result.success) {
    console.log("uv installed successfully");
    return true;
  } else {
    console.error("Failed to install uv:", result.error);
    return false;
  }
}

export async function getUvPath(): Promise<string> {
  if (await checkCommand("uv")) {
    return "uv";
  }

  const uvPaths = [
    join(homedir(), ".local", "bin", "uv"),
    join(homedir(), ".cargo", "bin", "uv"),
    "/usr/local/bin/uv",
  ];

  for (const path of uvPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  throw new Error("uv not found");
}

async function setupPythonEnvironment(): Promise<boolean> {
  console.log("Setting up Python environment...");

  const uvPath = await getUvPath();
  const venvPath = join(PYTHON_DIR, ".venv");

  if (!existsSync(venvPath)) {
    console.log("Creating Python 3.10 virtual environment...");
    const result = await runCommand(uvPath, [
      "venv",
      "--python",
      "3.10",
      venvPath,
    ]);

    if (!result.success) {
      console.error("Failed to create venv:", result.error);
      return false;
    }
  }

  return true;
}

async function installPythonDependencies(): Promise<boolean> {
  console.log("Installing Python dependencies...");

  const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
  if (!existsSync(pythonAppSrcDir)) {
    mkdirSync(pythonAppSrcDir, { recursive: true });
  }

  const ltxFolder = join(pythonAppSrcDir, "ltx-2-mlx");

  if (!existsSync(ltxFolder)) {
    let cloneCMD = await runCommand(
      "git",
      [`clone`, `https://github.com/dgrauet/ltx-2-mlx.git`, "ltx-2-mlx"],
      { cwd: pythonAppSrcDir },
    );

    console.log(cloneCMD.success, cloneCMD.output);
  }

  const uvPath = await getUvPath();

  const uvSyncResult = await runCommand(
    uvPath,
    [
      //
      "sync",
      "--all-extras",
    ],
    {
      cwd: ltxFolder,
    },
  );
  if (!uvSyncResult.success) {
    console.error("Failed to install ltx model:", uvSyncResult.error);
    return false;
  }

  const zImagePath = join(pythonAppSrcDir, "z-image-mps");

  if (!existsSync(zImagePath)) {
    let cloneCMD = await runCommand(
      "git",
      [`clone`, `https://github.com/ivanfioravanti/z-image-mps`, "z-image-mps"],
      { cwd: pythonAppSrcDir },
    );

    console.log(cloneCMD.success, cloneCMD.output);
  }

  const uvPathZimage = await getUvPath();

  const uvInstallZimage = await runCommand(
    uvPathZimage,
    [
      //
      "pip",
      "install",
      "-e",
      ".",
    ],
    {
      cwd: zImagePath,
    },
  );

  if (!uvInstallZimage.success) {
    console.error("Failed to install z image pip", uvInstallZimage.error);
    return false;
  }

  // const qwenImageMpsFolder = join(pythonAppSrcDir, "qwen-image-mps");
  // if (!existsSync(qwenImageMpsFolder)) {
  //   let cloneCMD = await runCommand(
  //     "git",
  //     [
  //       `clone`,
  //       `https://github.com/ivanfioravanti/qwen-image-mps`,
  //       "qwen-image-mps",
  //     ],
  //     { cwd: pythonAppSrcDir },
  //   );

  //   console.log(cloneCMD.success, cloneCMD.output);
  // }
  // const uvQwenImageMps = await runCommand(
  //   uvPathZimage,
  //   [
  //     //
  //     "pip",
  //     "install",
  //     "-e",
  //     ".",
  //   ],
  //   {
  //     cwd: qwenImageMpsFolder,
  //   },
  // );

  // if (!uvQwenImageMps.success) {
  //   console.error("Failed to install z image pip", uvQwenImageMps.error);
  //   return false;
  // }

  console.log("Python dependencies installed");
  return true;
}

// ========== Render Helpers ==========

/** Stream stdout/stderr from a process to console and SSE logs. Returns all text. */
async function streamProcessOutput(
  readable: ReadableStream<Uint8Array> | undefined,
  prefix: string,
  send: (event: string, data: object) => void,
): Promise<string> {
  let text = "";
  const reader = readable?.getReader();
  if (!reader) return text;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = new TextDecoder().decode(value);
      console.log(`[${prefix}]`, chunk);
      text += chunk;
      send("log", { text: chunk });
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

// ========== Render Functions ==========

let firstImageProcess: Subprocess | null = null;

async function testRenderImage({
  send,
}: {
  send: (event: string, data: object) => void;
}): Promise<boolean> {
  console.log("Try Render Image...");

  const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
  if (!existsSync(pythonAppSrcDir)) {
    mkdirSync(pythonAppSrcDir, { recursive: true });
  }

  const zImageFolder = join(pythonAppSrcDir, "z-image-mps");
  const uvPath = await getUvPath();

  // Kill any previous image process
  if (firstImageProcess && !firstImageProcess.killed) {
    firstImageProcess.kill();
  }

  if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
    mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
  }

  const outputPath = join(OUTPUT_DIR, "welcome", "thank-you.png");
  if (existsSync(outputPath)) {
    console.log("Image already rendered, skipping.");
    return true;
  }

  firstImageProcess = spawn(
    [
      uvPath,
      "run",
      "z-image-mps.py",
      "-p",
      "A very cute lamb stadning on two feet, two hands at a park. The image is render in kids cartoon 3d movie style. a line of text that says: Thank you so much for using Lambobo AI Studio!",
      "--aspect",
      "1:1",
      "--height",
      "512",
      "--width",
      "512",
      "--output",
      outputPath,
      "--device",
      "mps",
    ],
    {
      cwd: zImageFolder,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const proc: Subprocess = firstImageProcess;

  // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
  const stdoutPromise = streamProcessOutput(
    proc.stdout as ReadableStream<Uint8Array>,
    "Image",
    send,
  );
  const stderrText = await streamProcessOutput(
    proc.stderr as ReadableStream<Uint8Array>,
    "Image",
    send,
  );
  await stdoutPromise;

  // Wait for process to exit and check result
  const exitCode = await proc.exited;
  const success = exitCode === 0 && existsSync(outputPath);

  if (success) {
    send("progress", {
      step: "render-image",
      status: "completed",
      label: "Rendering test image...",
    });
  } else {
    send("progress", {
      step: "render-image",
      status: "error",
      label: "Rendering test image...",
      error: stderrText || `Process exited with code ${exitCode}`,
    });
  }

  return success;
}

let firstVideoProcess: Subprocess | null = null;

async function testRenderVideo({
  send,
}: {
  send: (event: string, data: object) => void;
}): Promise<boolean> {
  console.log("Try Render Video...");

  const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
  if (!existsSync(pythonAppSrcDir)) {
    mkdirSync(pythonAppSrcDir, { recursive: true });
  }

  const ltxFolder = join(pythonAppSrcDir, "ltx-2-mlx");
  const uvPath = await getUvPath();

  // Kill any previous video process
  if (firstVideoProcess && !firstVideoProcess.killed) {
    firstVideoProcess.kill();
  }

  if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
    mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
  }

  const outputPath = join(OUTPUT_DIR, "welcome", "thank-you.mp4");
  if (existsSync(outputPath)) {
    console.log("Video already rendered, skipping.");
    return true;
  }

  const lambobo = join(
    import.meta.path,
    "..",
    "..",
    "python-src",
    "images",
    "lambobo.png",
  );

  firstVideoProcess = spawn(
    [
      uvPath,
      "run",
      "ltx-2-mlx",
      "generate",
      "--model",
      "dgrauet/ltx-2.3-mlx-q4",
      "--prompt",
      `${JSON.stringify("No text on screen. a 5 years old cute lamb wanting to have a hug, he says: Hi! Thank you for using Lambobo Studio!")}`,
      "--distilled",
      "--low-ram",
      "--frames",
      "121",
      "--width",
      "480",
      "--height",
      "480",
      "--frame-rate",
      "24",
      "--image",
      `${lambobo}`,
      "--output",
      outputPath,
    ],
    {
      cwd: ltxFolder,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const proc: Subprocess = firstVideoProcess;

  // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
  const stdoutPromise = streamProcessOutput(
    proc.stdout as ReadableStream<Uint8Array>,
    "Video",
    send,
  );
  const stderrText = await streamProcessOutput(
    proc.stderr as ReadableStream<Uint8Array>,
    "Video",
    send,
  );
  await stdoutPromise;

  // Wait for process to exit and check result
  const exitCode = await proc.exited;
  const success = exitCode === 0 && existsSync(outputPath);

  if (success) {
    send("progress", {
      step: "render-video",
      status: "completed",
      label: "Rendering test video...",
    });
  } else {
    send("progress", {
      step: "render-video",
      status: "error",
      label: "Rendering test video...",
      error: stderrText || `Process exited with code ${exitCode}`,
    });
  }

  return success;
}

// // ========== Render Functions ==========

// let firstImageEdit: Subprocess | null = null;

// async function testQwenImageEditGeneration({
//   send,
// }: {
//   send: (event: string, data: object) => void;
// }): Promise<boolean> {
//   console.log("Try Render Image...");

//   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
//   if (!existsSync(pythonAppSrcDir)) {
//     mkdirSync(pythonAppSrcDir, { recursive: true });
//   }

//   const zImageFolder = join(pythonAppSrcDir, "qwen-image-mps");
//   const uvPath = await getUvPath();

//   // Kill any previous image process
//   if (firstImageEdit && !firstImageEdit.killed) {
//     firstImageEdit.kill();
//   }

//   if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
//     mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
//   }

//   //
//   const outputPath = join(OUTPUT_DIR, "welcome", "thank-you-edit.png");
//   if (existsSync(outputPath)) {
//     console.log("Image already rendered, skipping.");
//     return true;
//   }

//   const lambobo = join(
//     import.meta.path,
//     "..",
//     "..",
//     "python-src",
//     "images",
//     "lambobo.png",
//   );

//   firstImageEdit = spawn(
//     [
//       uvPath,
//       "run",
//       "qwen-image-mps",
//       "edit",
//       "-i",
//       JSON.stringify(lambobo),
//       "-p",
//       "Change the background to sunset",
//       "--ultra-fast",
//       "--quantization",
//       "Q4_0",
//       "--output",
//       JSON.stringify(outputPath),
//     ],
//     {
//       cwd: zImageFolder,
//       stdout: "pipe",
//       stderr: "pipe",
//     },
//   );

//   const proc: Subprocess = firstImageEdit;

//   // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
//   const stdoutPromise = streamProcessOutput(
//     proc.stdout as ReadableStream<Uint8Array>,
//     "EditImage",
//     send,
//   );
//   const stderrText = await streamProcessOutput(
//     proc.stderr as ReadableStream<Uint8Array>,
//     "EditImage",
//     send,
//   );
//   await stdoutPromise;

//   // Wait for process to exit and check result
//   const exitCode = await proc.exited;
//   const success = exitCode === 0 && existsSync(outputPath);

//   if (success) {
//     send("progress", {
//       step: "edit-image",
//       status: "completed",
//       label: "Processing edit image task...",
//     });
//   } else {
//     send("progress", {
//       step: "edit-image",
//       status: "error",
//       label: "Processing edit image task...",
//       error: stderrText || `Process exited with code ${exitCode}`,
//     });
//   }

//   return success;
// }

// // ========== Render Functions ==========

// let firstQwenImageGen: Subprocess | null = null;

// async function testQwenImageGeneration({
//   send,
// }: {
//   send: (event: string, data: object) => void;
// }): Promise<boolean> {
//   console.log("Try Generate Image...");

//   const pythonAppSrcDir = join(APP_DATA_DIR, "python-src");
//   if (!existsSync(pythonAppSrcDir)) {
//     mkdirSync(pythonAppSrcDir, { recursive: true });
//   }

//   const binaryFolder = join(pythonAppSrcDir, "qwen-image-mps");
//   const uvPath = await getUvPath();

//   // Kill any previous image process
//   if (firstQwenImageGen && !firstQwenImageGen.killed) {
//     firstQwenImageGen.kill();
//   }

//   if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
//     mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
//   }

//   //
//   const outputPath = join(
//     OUTPUT_DIR,
//     "welcome",
//     "thank-you-qwen-image-gen.png",
//   );
//   // const outputFolderPath = join(OUTPUT_DIR, "welcome");
//   if (existsSync(outputPath)) {
//     console.log("Image already rendered, skipping.");
//     return true;
//   }

//   // const lambobo = join(
//   //   import.meta.path,
//   //   "..",
//   //   "..",
//   //   "python-src",
//   //   "images",
//   //   "lambobo.png",
//   // );

//   let tempFolder = join(
//     OUTPUT_DIR,
//     "welcome",
//     "generation-temp",
//     `_${Math.random().toString(36).slice(2, 9)}`,
//   );
//   mkdirSync(tempFolder, { recursive: true });

//   firstQwenImageGen = spawn(
//     [
//       uvPath,
//       "run",
//       "qwen-image-mps",
//       "generate",

//       "-p",
//       "Draw a sunset",
//       "--outdir",
//       JSON.stringify(tempFolder),
//       "--ultra-fast",
//       "--quantization",
//       "Q4_0",
//       "--aspect",
//       "16:9",
//     ],
//     {
//       cwd: binaryFolder,
//       stdout: "pipe",
//       stderr: "pipe",
//     },
//   );

//   const proc: Subprocess = firstQwenImageGen;

//   // Stream stdout and stderr concurrently (cast: we always use "pipe" mode)
//   const stdoutPromise = streamProcessOutput(
//     proc.stdout as ReadableStream<Uint8Array>,
//     "QwenImageGen",
//     send,
//   );
//   const stderrText = await streamProcessOutput(
//     proc.stderr as ReadableStream<Uint8Array>,
//     "QwenImageGen",
//     send,
//   );
//   await stdoutPromise;

//   // Wait for process to exit and check result
//   const exitCode = await proc.exitCode;
//   const success = exitCode === 0;

//   if (success) {
//     // please list the first file in tempFolder

//     async function listFiles(directoryPath: string) {
//       try {
//         const files = await readdir(directoryPath);
//         console.log(files); // Array of file and folder names

//         return files;
//       } catch (err) {
//         console.error("Error reading directory:", err);
//         return [];
//       }
//     }

//     const items = await listFiles(`${tempFolder}`);

//     for await (let item of items) {
//       if (item.includes(".png")) {
//         await rename(item, join(outputPath));
//       }
//     }
//     unlinkSync(tempFolder);

//     send("progress", {
//       step: "qwen-image",
//       status: "completed",
//       label: "Test qwen image generation...",
//     });
//   } else {
//     send("progress", {
//       step: "qwen-image",
//       status: "error",
//       label: "Test qwen image generation...",
//       error: stderrText || `Process exited with code ${exitCode}`,
//     });
//   }

//   return success;
// }
