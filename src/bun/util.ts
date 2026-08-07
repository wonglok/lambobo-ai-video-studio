import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { execSync } from "node:child_process";

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
  videoTestRendered: boolean;
  allOK: boolean;
  error?: string;
}

let setupState: SetupState = {
  port: "",
  uvInstalled: false,
  pythonInstalled: false,
  depsInstalled: false,
  backendRunning: false,
  videoTestRendered: false,
  allOK: false,
  error: "",
};

export async function runSetup({}: {}): Promise<SetupState> {
  [APP_DATA_DIR, PYTHON_DIR, OUTPUT_DIR].forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

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
      videoTestRendered: false,
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

    await testRenderImage({
      send: send,
    });

    await testRenderVideo({
      send: send,
    });

    setupState.allOK = true;
    send("complete", { success: true, port: BACKEND_PORT });
    res.end();
  });

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

async function getUvPath(): Promise<string> {
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

  console.log("Python dependencies installed");
  return true;
}

let firstImageProcess: any;
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

  if (firstImageProcess) {
    if (!firstImageProcess?.killed) {
      firstImageProcess.kill();
    }
  }

  if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
    mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
  }

  if (existsSync(join(OUTPUT_DIR, "welcome", "thank-you.png"))) {
    return true;
  }

  // let lambobo = join(
  //   import.meta.path,
  //   "..",
  //   "..",
  //   "python-src",
  //   "images",
  //   "lambobo.png",
  // );

  // console.log("lambobo", lambobo);

  firstImageProcess = spawn(
    [
      uvPath,

      //
      "run",
      "z-image-mps.py",
      "-p",
      "A cute lamb in kids cartoon 3d movie style. a line of text that says: Thank you so much for using Lambobo AI Studio!",
      "--aspect",
      "1:1",
      "--height",
      "512",
      "--width",
      "512",
      "--output",
      join(OUTPUT_DIR, "welcome", "thank-you.png"),
      "--device",
      "mps",

      //
    ],
    {
      cwd: zImageFolder,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  let doneAll = false;

  // Log backend output and forward to UI
  (async () => {
    const reader = firstImageProcess?.stdout.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        doneAll = true;
        break;
      }
      const text = new TextDecoder().decode(value);
      console.log("[Backend Image]", text);
      send("log", { text: text });
    }
  })();

  let hasError = "";

  // Log backend output and forw ard to UI
  (async () => {
    const reader = firstImageProcess?.stderr.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const text = new TextDecoder().decode(value);
      console.log("[Backend Image]", text);
      hasError += text;
      hasError = hasError.trim();
      send("log", { text: text });
    }
  })();

  // let proc: Subprocess = firstImageProcess;

  return await new Promise(async (resolve) => {
    let ttt = setInterval(() => {
      if (doneAll) {
        clearInterval(ttt);

        if (hasError.length >= 10) {
          resolve(false);
        } else {
          resolve(true);
        }
        firstImageProcess.kill();
      }
    });
  });
}

let firstVideoProcess: any;
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

  if (firstVideoProcess) {
    if (!firstVideoProcess?.killed) {
      firstVideoProcess.kill();
    }
  }

  if (!existsSync(join(OUTPUT_DIR, "welcome"))) {
    mkdirSync(join(OUTPUT_DIR, "welcome"), { recursive: true });
  }

  if (existsSync(join(OUTPUT_DIR, "welcome", "thank-you.mp4"))) {
    return true;
  }

  let lambobo = join(
    import.meta.path,
    "..",
    "..",
    "python-src",
    "images",
    "lambobo.png",
  );

  // console.log("lambobo", lambobo);
  // console.log("lambobo", lambobo);
  // console.log("lambobo", lambobo);
  // console.log("lambobo", lambobo);

  firstVideoProcess = spawn(
    [
      uvPath,
      "run",
      "ltx-2-mlx",
      "generate",
      //
      "--model",
      "dgrauet/ltx-2.3-mlx-q4",
      //
      "--prompt",
      `${JSON.stringify("a 5 years old cute lamb wanting to have a hug, he says: Hi! Thank you for using Lambobo Studio!")}`,
      //
      "--distilled",
      "--low-ram",
      //
      "--frames",
      "121",
      //
      "--width",
      "480",
      //
      "--height",
      "480",
      //
      "--frame-rate",
      "24",
      //
      "--image",
      `${lambobo}`,
      //
      "--output",
      `${join(OUTPUT_DIR, "welcome", "thank-you.mp4")}`,
    ],
    {
      cwd: ltxFolder,
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  let doneAll = false;

  // Log backend output and forward to UI
  (async () => {
    const reader = firstVideoProcess?.stdout.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        doneAll = true;
        break;
      }
      const text = new TextDecoder().decode(value);
      console.log("[Backend]", text);
      send("log", { text: text });
    }
  })();

  let hasError = "";

  // Log backend output and forw ard to UI
  (async () => {
    const reader = firstVideoProcess?.stderr.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const text = new TextDecoder().decode(value);
      console.log("[Backend]", text);
      hasError += text;
      hasError = hasError.trim();
      send("log", { text: text });
    }
  })();

  // let proc: Subprocess = firstVideoProcess;

  return await new Promise(async (resolve) => {
    let ttt = setInterval(() => {
      if (doneAll) {
        clearInterval(ttt);

        if (hasError.length >= 10) {
          resolve(false);
        } else {
          resolve(true);
        }
        firstVideoProcess.kill();
      }
    });
  });
}
