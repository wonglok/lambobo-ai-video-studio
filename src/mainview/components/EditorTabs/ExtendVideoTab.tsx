import { useEffect, useRef } from "react";
import { useGenerationStore } from "../../stores/generationStore";

interface Props {
  projectId: string;
}

export default function ExtendVideoTab({ projectId }: Props) {
  const store = useGenerationStore();
  const extendLogRef = useRef<HTMLPreElement | any>(null);

  useEffect(() => {
    if (extendLogRef.current) {
      extendLogRef.current.scrollTop = 100000;
    }
  }, [store.extend.logs]);

  const handleGenerateExtend = async () => {
    await store.generateExtend(
      projectId,
      store.selectedVideo?.url || store.selectedVideo?.filename || "",
    );
    document.body.scrollTop = 99999999999;
  };

  // ========== SVG Icons ==========

  const ExtendIcon = (
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
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      <line x1="5" y1="12" x2="11" y2="12" />
      <line x1="8" y1="9" x2="8" y2="15" />
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-500">{ExtendIcon}</span>
        <h2 className="text-base font-semibold text-tiffany-900">
          Extend Video
        </h2>
      </div>

      {/* Source video picker */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Source Video
        </label>
        {store.projectVideosLoading ? (
          <p className="text-xs text-tiffany-400 italic py-4 text-center">
            Loading videos...
          </p>
        ) : store.projectVideos.length === 0 ? (
          <p className="text-xs text-tiffany-400 italic py-4 text-center border border-dashed border-tiffany-200 rounded-xl">
            No videos yet. Generate a video in the "Generate Video" tab.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 p-1">
            {store.projectVideos.map((v) => {
              const isSelected = store.selectedVideo?.filename === v.filename;
              const fullUrl = v.url.startsWith("http")
                ? v.url
                : `http://localhost:${(window as any).PORT}${v.url}`;
              return (
                <button
                  key={v.filename}
                  onClick={() => store.selectVideo(v)}
                  disabled={store.extend.generating}
                  className={`relative rounded-lg border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-tiffany-500 ring-2 ring-tiffany-300/40"
                      : "border-tiffany-200 hover:border-tiffany-300"
                  } disabled:opacity-50`}
                >
                  <video
                    src={fullUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="aspect-video object-cover object-center bg-black w-full h-full"
                    onMouseEnter={(e) => {
                      e.currentTarget.play();
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-tiffany-700 truncate text-center">
                    {v.filename}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {store.selectedVideo && (
          <p className="text-xs text-tiffany-600/60 mt-1.5">
            Selected:{" "}
            <span className="font-medium text-tiffany-700">
              {store.selectedVideo.filename}
            </span>
          </p>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Continue the Scene Prompt
        </label>
        <textarea
          value={store.extend.prompt}
          onChange={(e) => store.setExtendPrompt(e.target.value)}
          placeholder="Describe how the video should continue, e.g. the camera holds, the motion continues naturally..."
          rows={4}
          disabled={store.extend.generating}
          className="w-full px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* Extend frames */}
      <div>
        <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
          Extend Frames
        </label>
        <input
          type="number"
          min={1}
          max={128}
          value={store.extend.extendFrames}
          onChange={(e) =>
            store.setExtendFrames(parseInt(e.target.value, 10) || 0)
          }
          disabled={store.extend.generating}
          className="w-32 px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all disabled:opacity-50"
        />
        <p className="text-xs text-tiffany-600/50 mt-1.5">
          Number of latent frames to add to the end of the video.
        </p>
      </div>

      {/* Generate / Stop button */}
      {store.extend.generating ? (
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
              Extending...
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
          onClick={handleGenerateExtend}
          disabled={!store.selectedVideo || !store.extend.prompt.trim()}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-600 hover:bg-tiffany-700 active:bg-tiffany-800 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Extend Video
        </button>
      )}

      {/* Error */}
      {store.extend.error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {store.extend.error}
        </div>
      )}

      {/* Logs */}
      {store.extend.logs.length > 0 && (
        <div
          ref={extendLogRef}
          id="extend-logs"
          className="p-4 bg-tiffany-50 border border-tiffany-200 rounded-xl max-h-40 overflow-y-auto"
        >
          <p className="text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
            Logs
          </p>
          <pre className="text-xs text-tiffany-600 font-mono whitespace-pre-wrap">
            {store.extend.logs.join("\n")}
          </pre>
        </div>
      )}

      {/* Result */}
      {store.extend.result && (
        <div>
          <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
            Extended Video
          </label>
          <div className="relative rounded-xl overflow-hidden border border-tiffany-200 shadow-card bg-black w-[500px]">
            <video
              src={store.extend.result}
              controls
              className="w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
