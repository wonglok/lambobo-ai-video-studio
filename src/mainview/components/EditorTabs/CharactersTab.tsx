import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { useCharacterStore } from "../../stores/characterStore";
import { useGenerationStore } from "../../stores/generationStore";
import CropTool from "./CropTool";

const API_BASE = `http://localhost:${(window as any).PORT}`;
const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

interface Props {
  projectId: string;
}

/** Read an SSE response, invoking `onEvent(event, data)` for each event. */
async function readSSE(
  res: Response,
  onEvent: (event: string, data: any) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    let eventType = "message";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        try {
          onEvent(eventType, JSON.parse(line.slice(6)));
        } catch {
          // skip malformed lines
        }
        eventType = "message";
      }
    }
  }
}

/** Extract the first frame of a video as a PNG data URL using ffmpeg.wasm. */
async function extractFirstFrame(videoUrl: string): Promise<string> {
  const ffmpeg = new FFmpeg();
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
        "text/javascript",
      ),
      wasmURL: await toBlobURL(
        `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });

    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error("Failed to fetch generated video");
    const buf = new Uint8Array(await res.arrayBuffer());
    await ffmpeg.writeFile("input.mp4", buf);
    await ffmpeg.exec(["-i", "input.mp4", "-frames:v", "1", "output.png"]);
    const data = await ffmpeg.readFile("output.png");

    const bytes = new Uint8Array(data as Uint8Array);
    const blob = new Blob([bytes], { type: "image/png" });
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(new Error("Failed to read extracted frame"));
      fr.readAsDataURL(blob);
    });
  } finally {
    ffmpeg.terminate();
  }
}

function CharacterCard({ imageUrl, name }: { imageUrl: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 160;
    const H = 160;
    const BAR = 18;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, W, H + BAR);
      const scale = Math.max(W / img.width, H / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, H, W, BAR);
      ctx.fillStyle = "#fff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, W / 2, H + BAR / 2);
    };
    img.src = imageUrl;
  }, [imageUrl, name]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={178}
      className="rounded-lg border border-tiffany-200"
    />
  );
}

export default function CharactersTab({ projectId }: Props) {
  const characterStore = useCharacterStore();
  const gen = useGenerationStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    characterStore.fetchCharacters(projectId);
    gen.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const charUrl = (filename: string): string | null => {
    const img = gen.projectImages.find((i) => i.filename === filename);
    if (!img) return null;
    return img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;
  };

  const uploadImage = async (dataUrl: string): Promise<string | null> => {
    const res = await fetch(`${API_BASE}/api/upload/image`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: dataUrl,
        filename: `character-${Date.now()}.png`,
        projectId,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.filename as string;
  };

  const finishCharacter = async (dataUrl: string) => {
    setUploading(true);
    setError(null);
    try {
      const filename = await uploadImage(dataUrl);
      if (!filename) throw new Error("Upload failed");
      await characterStore.createCharacter(projectId, name.trim(), filename);
      await gen.fetchProjectImages(projectId);
      setName("");
      setPrompt("");
      setPendingImage(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedName || !trimmedPrompt) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/render/text-to-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          projectId,
          width: 480,
          height: 480,
          frames: 9,
          frameRate: 24,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      let videoPath: string | null = null;
      let genError: string | null = null;
      await readSSE(res, (event, data) => {
        if (event === "complete") videoPath = data.path as string;
        else if (event === "error") genError = data.error || "Generation failed";
      });
      if (genError) throw new Error(genError);
      if (!videoPath) throw new Error("No video generated");

      const videoUrl = `${API_BASE}/api/files?path=${encodeURIComponent(videoPath)}`;
      const frameDataUrl = await extractFirstFrame(videoUrl);
      await finishCharacter(frameDataUrl);
    } catch (e) {
      setError(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    await characterStore.deleteCharacter(confirmDeleteId, projectId);
    setConfirmDeleteId(null);
  };

  // ========== SVG Icons ==========

  const CharacterIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const UploadIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );

  const SparkleIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  const TrashIcon = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-500">{CharacterIcon}</span>
        <h2 className="text-base font-semibold text-tiffany-900">Characters</h2>
      </div>

      {/* Create character */}
      <div className="border border-tiffany-200 rounded-xl p-4 flex flex-col gap-3 bg-tiffany-50/40">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Character name"
          className="px-3 py-2 bg-white border border-tiffany-200 rounded-lg text-sm text-tiffany-900 placeholder-tiffany-400 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Or generate from prompt (creates a 9-frame video, then extracts a frame)"
          rows={2}
          className="px-3 py-2 bg-white border border-tiffany-200 rounded-lg text-sm text-tiffany-900 placeholder-tiffany-400 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 resize-none"
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-tiffany-200 bg-white text-tiffany-600 hover:border-tiffany-300 transition-colors"
          >
            {UploadIcon}
            Upload Image
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || uploading || !name.trim() || !prompt.trim()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white transition-colors"
          >
            {SparkleIcon}
            Generate
          </button>
        </div>

        {generating && (
          <p className="text-xs text-tiffany-600 italic">
            Generating character... (this may take a while)
          </p>
        )}
        {uploading && (
          <p className="text-xs text-tiffany-600 italic">Saving character...</p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {/* Crop tool */}
      {pendingImage && (
        <CropTool
          image={pendingImage}
          onCancel={() => setPendingImage(null)}
          onApply={finishCharacter}
        />
      )}

      {/* Character grid */}
      {characterStore.loading ? (
        <p className="text-xs text-tiffany-400 italic text-center py-8">
          Loading characters...
        </p>
      ) : characterStore.characters.length === 0 ? (
        <p className="text-xs text-tiffany-400 italic text-center py-8 border border-dashed border-tiffany-200 rounded-xl">
          No characters yet. Upload or generate one.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {characterStore.characters.map((c) => {
            const url = charUrl(c.filename);
            return (
              <div key={c.id} className="relative group">
                {url ? (
                  <CharacterCard imageUrl={url} name={c.name} />
                ) : (
                  <div className="w-[160px] h-[178px] rounded-lg border border-tiffany-200 bg-tiffany-100 flex items-center justify-center text-tiffany-400">
                    {CharacterIcon}
                  </div>
                )}
                <button
                  onClick={() => setConfirmDeleteId(c.id)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete character"
                >
                  {TrashIcon}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-card p-5 w-80">
            <h3 className="text-sm font-semibold text-tiffany-900 mb-2">
              Delete Character
            </h3>
            <p className="text-xs text-tiffany-600 mb-4">
              Are you sure you want to delete this character?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-tiffany-200 text-tiffany-600 hover:bg-tiffany-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
