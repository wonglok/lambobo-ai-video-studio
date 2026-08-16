import { useEffect, useRef, useState } from "react";
import { useReferencesToVideoStore } from "../../stores/referencesToVideoStore";
import { useGenerationStore } from "../../stores/generationStore";

interface Props {
  projectId: string;
}

export default function ReferencesToVideoTab({ projectId }: Props) {
  const store = useReferencesToVideoStore();
  const genStore = useGenerationStore();

  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    store.checkStatus();
    genStore.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [store.genLogs]);

  const findImage = (filename: string | null) =>
    genStore.projectImages.find((img) => img.filename === filename) || null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const path = await genStore.uploadImage(projectId, base64, file.name);
      if (path) {
        genStore.fetchProjectImages(projectId);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ========== SVG Icons ==========

  const BookIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-tiffany-500"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );

  const DownloadIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );

  const CheckIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  const SpinnerIcon = (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
    </svg>
  );

  const ImageIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );

  const SparkleIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );

  const renderSlot = (slot: 1 | 2) => {
    const filename = slot === 1 ? store.refImage1 : store.refImage2;
    const img = findImage(filename);
    const isActive = activeSlot === slot;

    return (
      <button
        onClick={() => setActiveSlot(slot)}
        disabled={store.generating}
        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all text-left ${
          isActive
            ? "border-tiffany-500 ring-2 ring-tiffany-300/40"
            : "border-tiffany-200 hover:border-tiffany-300"
        } disabled:opacity-50`}
      >
        <span className="text-[10px] font-semibold text-tiffany-600 uppercase tracking-wider">
          Image {slot}
        </span>
        {img ? (
          <img
            src={img.url}
            alt={img.filename}
            className="w-24 h-24 object-cover rounded-lg"
          />
        ) : (
          <span className="w-24 h-24 rounded-lg bg-tiffany-50 border border-dashed border-tiffany-200 flex items-center justify-center text-tiffany-300">
            {ImageIcon}
          </span>
        )}
        <span className="text-[10px] text-tiffany-600 truncate max-w-[96px]">
          {filename || "Not selected"}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        {BookIcon}
        <h2 className="text-base font-semibold text-tiffany-900">
          References to Video
        </h2>
      </div>

      {/* Model download */}
      <div className="border border-tiffany-200 rounded-xl p-4 flex flex-col gap-3 bg-tiffany-50/40">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-tiffany-800">
            AI Model
          </span>
          <span className="text-xs text-tiffany-600">
            appautomaton/minimax-h3-base-8bit-mlx
          </span>
        </div>

        <button
          onClick={() => store.downloadModel()}
          disabled={store.downloading || store.downloaded}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-tiffany-500 hover:bg-tiffany-600 disabled:bg-tiffany-100 disabled:text-tiffany-500 text-white transition-colors"
        >
          {store.downloading
            ? SpinnerIcon
            : store.downloaded
              ? CheckIcon
              : DownloadIcon}
          {store.downloading
            ? "Downloading..."
            : store.downloaded
              ? "Model Downloaded"
              : "Download Model"}
        </button>

        {store.error && <p className="text-xs text-red-600">{store.error}</p>}

        {store.logs.length > 0 && (
          <div className="p-2 bg-tiffany-50 border border-tiffany-200 rounded-lg max-h-40 overflow-y-auto">
            <pre className="text-[10px] text-tiffany-600 font-mono whitespace-pre-wrap">
              {store.logs.join("")}
            </pre>
          </div>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Prompt
        </label>
        <textarea
          value={store.prompt}
          onChange={(e) => store.setPrompt(e.target.value)}
          placeholder="Describe the scene using [image1] and [image2] placeholders..."
          rows={3}
          disabled={store.generating}
          className="w-full px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all resize-none disabled:opacity-50"
        />
        <p className="text-xs text-tiffany-600/50 mt-1.5">
          Use{" "}
          <code className="text-[11px] bg-tiffany-100 px-1 rounded">
            [image1]
          </code>{" "}
          and{" "}
          <code className="text-[11px] bg-tiffany-100 px-1 rounded">
            [image2]
          </code>{" "}
          to reference the selected images.
        </p>
      </div>

      {/* Reference images */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Reference Images
        </label>
        <div className="flex gap-2 mb-3">
          {renderSlot(1)}
          {renderSlot(2)}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={store.generating}
            className="flex-1 text-sm text-tiffany-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-tiffany-100 file:text-tiffany-700 hover:file:bg-tiffany-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
          />
        </div>
        <p className="text-xs text-tiffany-600/50">
          Select a slot above, then click an image below to assign it (or upload
          a new one).
        </p>

        {genStore.projectImagesLoading ? (
          <p className="text-xs text-tiffany-400 italic py-4 text-center">
            Loading images...
          </p>
        ) : genStore.projectImages.length === 0 ? (
          <p className="text-xs text-tiffany-400 italic py-4 text-center border border-dashed border-tiffany-200 rounded-xl">
            No images yet. Upload one above.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 mt-2">
            {genStore.projectImages.map((img) => {
              const isSelected =
                img.filename === store.refImage1 ||
                img.filename === store.refImage2;

              return (
                <button
                  key={`${img.source}-${img.filename}`}
                  onClick={() => {
                    if (activeSlot === 1) store.setRefImage1(img.filename);
                    else store.setRefImage2(img.filename);
                  }}
                  disabled={store.generating}
                  className={`relative rounded-lg border-2 transition-all ${
                    isSelected
                      ? "border-tiffany-500 ring-2 ring-tiffany-300/40"
                      : "border-tiffany-200 hover:border-tiffany-300"
                  } disabled:opacity-50`}
                >
                  <img
                    src={img.url}
                    alt={img.filename}
                    className="aspect-square object-cover object-center"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-tiffany-700 truncate text-center">
                    {img.filename}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Parameters */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Parameters
        </label>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(
            [
              { label: "Steps", value: store.steps, set: store.setSteps },
              { label: "Width", value: store.width, set: store.setWidth },
              { label: "Height", value: store.height, set: store.setHeight },
              { label: "Seconds", value: store.seconds, set: store.setSeconds },
              { label: "Seed", value: store.seed, set: store.setSeed },
            ] as const
          ).map((p) => (
            <div key={p.label} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-tiffany-700">
                {p.label}
              </label>
              <input
                type="number"
                value={p.value}
                onChange={(e) => p.set(Number(e.target.value))}
                disabled={store.generating}
                step={0.5}
                className="px-3 py-2 bg-tiffany-50 border border-tiffany-200 rounded-lg text-tiffany-900 text-sm focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Generate / Stop */}
      {store.generating ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl">
            <svg
              className="animate-spin text-tiffany-500"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.75" />
            </svg>
            <span className="text-sm font-medium text-tiffany-700">
              Generating...
            </span>
          </div>
          <button
            onClick={() => store.cancelGenerate()}
            className="flex items-center justify-center gap-1.5 px-5 py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop
          </button>
        </div>
      ) : (
        <button
          onClick={() => store.generate(projectId)}
          disabled={
            !store.prompt.trim() || !store.refImage1 || !store.downloaded
          }
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-600 hover:bg-tiffany-700 active:bg-tiffany-800 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Video
        </button>
      )}
      {!store.downloaded && (
        <p className="text-xs text-tiffany-500 -mt-2">
          Download the AI model above before generating.
        </p>
      )}

      {/* Error */}
      {store.genError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {store.genError}
        </div>
      )}

      {/* Logs */}
      {store.genLogs.length > 0 && (
        <div
          ref={logRef}
          className="p-4 bg-tiffany-50 border border-tiffany-200 rounded-xl max-h-40 overflow-y-auto"
        >
          <p className="text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
            Logs
          </p>
          <pre className="text-xs text-tiffany-600 font-mono whitespace-pre-wrap">
            {store.genLogs.join("")}
          </pre>
        </div>
      )}

      {/* Result */}
      {store.result && (
        <div>
          <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
            Generated Video
          </label>
          <div className="relative rounded-xl overflow-hidden border border-tiffany-200 shadow-card bg-black w-full max-w-[500px]">
            <video src={store.result} controls className="w-full h-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
