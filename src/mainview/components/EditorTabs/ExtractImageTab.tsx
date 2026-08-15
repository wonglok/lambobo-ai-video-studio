import { useEffect, useRef, useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { useGenerationStore, type ProjectVideo } from "../../stores/generationStore";

const API_BASE = `http://localhost:${(window as any).PORT}`;
const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

interface Props {
  projectId: string;
}

/** Extract the frame at `time` seconds from a video as a PNG data URL using ffmpeg.wasm. */
async function extractFrameAt(
  videoUrl: string,
  time: number,
): Promise<string> {
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
    if (!res.ok) throw new Error("Failed to fetch video");
    const buf = new Uint8Array(await res.arrayBuffer());
    await ffmpeg.writeFile("input.mp4", buf);
    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-ss",
      time.toFixed(3),
      "-frames:v",
      "1",
      "output.png",
    ]);
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

export default function ExtractImageTab({ projectId }: Props) {
  const gen = useGenerationStore();

  const videoRef = useRef<HTMLVideoElement>(null);

  const [selected, setSelected] = useState<ProjectVideo | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gen.fetchProjectVideos(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const selectVideo = (v: ProjectVideo) => {
    setSelected(v);
    setExtracted(null);
    setSaved(false);
    setDuration(0);
    setTime(0);
    setError(null);
  };

  const onLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const d = e.currentTarget.duration;
    setDuration(Number.isFinite(d) ? d : 0);
    setTime(0);
  };

  const handleExtract = async () => {
    if (!selected) return;
    setExtracting(true);
    setError(null);
    setExtracted(null);
    setSaved(false);
    try {
      const dataUrl = await extractFrameAt(selected.url, time);
      setExtracted(dataUrl);
    } catch (e) {
      setError(String(e));
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!extracted) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/api/upload/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: extracted,
          filename: `extract-${Date.now()}.png`,
          projectId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await gen.fetchProjectImages(projectId);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  // ========== SVG Icons ==========

  const VideoIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );

  const CameraIcon = (
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );

  const SaveIcon = (
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
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-500">{CameraIcon}</span>
        <h2 className="text-base font-semibold text-tiffany-900">
          Image Extract from Video
        </h2>
      </div>

      {/* Video picker */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Videos
        </label>
        {gen.projectVideosLoading ? (
          <p className="text-xs text-tiffany-400 italic py-4 text-center">
            Loading videos...
          </p>
        ) : gen.projectVideos.length === 0 ? (
          <p className="text-xs text-tiffany-400 italic py-4 text-center border border-dashed border-tiffany-200 rounded-xl">
            No generated videos yet.
          </p>
        ) : (
          <ul className="divide-y divide-tiffany-100 border border-tiffany-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            {gen.projectVideos.map((v) => (
              <li key={v.filename}>
                <button
                  onClick={() => selectVideo(v)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    selected?.filename === v.filename
                      ? "bg-tiffany-100 text-tiffany-800"
                      : "text-tiffany-600 hover:bg-tiffany-50"
                  }`}
                >
                  <span className="text-tiffany-400">{VideoIcon}</span>
                  <span className="truncate">{v.filename}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="flex flex-col gap-4">
          <video
            ref={videoRef}
            src={selected.url}
            controls
            onLoadedMetadata={onLoadedMetadata}
            className="w-full max-h-64 rounded-xl border border-tiffany-200 bg-black"
          />

          <div>
            <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
              Moment ({time.toFixed(2)}s / {duration.toFixed(2)}s)
            </label>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.05}
              value={time}
              onChange={(e) => setTime(Number(e.target.value))}
              disabled={!duration}
              className="w-full accent-tiffany-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExtract}
              disabled={extracting || !duration}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white transition-colors"
            >
              {CameraIcon}
              Extract Frame
            </button>
            {extracting && (
              <span className="text-xs text-tiffany-600 italic">
                Extracting... (loading ffmpeg.wasm)
              </span>
            )}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {extracted && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl overflow-hidden border border-tiffany-200 inline-block bg-tiffany-100">
                <img
                  src={extracted}
                  alt="extracted"
                  className="max-h-72 object-contain"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || saved}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-tiffany-600 hover:bg-tiffany-700 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white transition-colors"
                >
                  {SaveIcon}
                  {saved ? "Saved to Project" : "Save to Project"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
