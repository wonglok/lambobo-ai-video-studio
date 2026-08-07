import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";
import { useGenerationStore } from "../stores/generationStore";

export default function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, fetchProjects } = useProjectStore();
  const [project, setProject] = useState<Project | null>(null);

  // Zustand generation store
  const store = useGenerationStore();

  // Local refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageLogRef = useRef<HTMLPreElement>(null);
  const videoLogRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, []);

  useEffect(() => {
    const found = projects.find((p) => p.id === id) || null;
    setProject(found);
  }, [id, projects]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (imageLogRef.current) {
      imageLogRef.current.scrollTop = 99999999999999999;
    }
  }, [store.image.logs]);

  useEffect(() => {
    if (videoLogRef.current) {
      videoLogRef.current.scrollTop = 99999999999999999;
    }
  }, [store.video.logs]);

  // Fetch project images when switching to the video tab
  useEffect(() => {
    if (store.activeTab === "video" && id) {
      store.fetchProjectImages(id);
    }
  }, [store.activeTab, id]);

  // ========== Handlers ==========

  const handleGenerateImage = () => {
    if (id) store.generateImage(id);
  };

  const handleGenerateVideo = async () => {
    if (id) {
      await store.generateVideo(id);
      document.body.scrollTop = 99999999999;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    // Read file as base64 data URL
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const uploadedPath = await store.uploadImage(id, base64, file.name);
      if (uploadedPath) {
        // Refresh the project images list so the new upload appears
        store.fetchProjectImages(id);
      }
    };
    reader.readAsDataURL(file);

    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  // ========== SVG Icons ==========

  const BackIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );

  const ImageIcon = (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );

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

  // ========== Loading / Not Found ==========

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-tiffany-50">
        <div className="w-16 h-16 bg-tiffany-100 rounded-2xl flex items-center justify-center mb-4">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#81d8d0"
            strokeWidth="1.5"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-tiffany-800 mb-3">
          Project not found
        </p>
        <button
          onClick={() => navigate("/app")}
          className="flex items-center gap-1.5 px-4 py-2 bg-tiffany-100 hover:bg-tiffany-200 text-tiffany-700 text-sm font-medium rounded-xl transition-colors"
        >
          {BackIcon}
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-tiffany-50">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-tiffany-100">
        <button
          onClick={() => {
            store.resetAll();
            navigate("/app");
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-tiffany-50 hover:bg-tiffany-100 text-tiffany-700 text-sm font-medium rounded-xl transition-colors border border-tiffany-200/60"
        >
          {BackIcon}
          Back
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-tiffany-900 tracking-tight">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-xs text-tiffany-600/60 mt-0.5">
              {project.description}
            </p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 px-6 pt-5 pb-0 bg-tiffany-50">
        <button
          onClick={() => store.setActiveTab("image")}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-xl transition-all duration-150 ${
            store.activeTab === "image"
              ? "bg-white text-tiffany-700 shadow-sm border border-b-0 border-tiffany-200"
              : "text-tiffany-600/60 hover:text-tiffany-700 hover:bg-tiffany-100/60"
          }`}
        >
          {ImageIcon}
          Scene Image Generation
        </button>
        <button
          onClick={() => store.setActiveTab("video")}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-t-xl transition-all duration-150 ${
            store.activeTab === "video"
              ? "bg-white text-tiffany-700 shadow-sm border border-b-0 border-tiffany-200"
              : "text-tiffany-600/60 hover:text-tiffany-700 hover:bg-tiffany-100/60"
          }`}
        >
          {VideoIcon}
          Scene Video Generation
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-6 pb-6">
        <div className="bg-white border border-tiffany-200 rounded-b-2xl rounded-tr-2xl shadow-card p-6 min-h-full">
          {store.activeTab === "image" ? (
            /* ========== IMAGE GENERATION PANEL ========== */
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <span className="text-tiffany-500">{ImageIcon}</span>
                <h2 className="text-base font-semibold text-tiffany-900">
                  Scene Image Generation
                </h2>
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                  Scene Prompt
                </label>
                <textarea
                  value={store.image.prompt}
                  onChange={(e) => store.setImagePrompt(e.target.value)}
                  placeholder="Describe the scene you want to generate..."
                  rows={4}
                  disabled={store.image.generating}
                  className="w-full px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all resize-none disabled:opacity-50"
                />
              </div>

              {/* Generate button (image) */}
              <button
                onClick={handleGenerateImage}
                disabled={store.image.generating || !store.image.prompt.trim()}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-600 hover:bg-tiffany-700 active:bg-tiffany-800 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
              >
                {store.image.generating ? (
                  <>
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
                    Generating...
                  </>
                ) : (
                  <>
                    {SparkleIcon}
                    Generate Image
                  </>
                )}
              </button>

              {/* Error */}
              {store.image.error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {store.image.error}
                </div>
              )}

              {/* Logs */}
              {store.image.logs.length > 0 && (
                <div className="p-4 bg-tiffany-50 border border-tiffany-200 rounded-xl max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                    Logs
                  </p>
                  <pre
                    ref={imageLogRef}
                    className="text-xs text-tiffany-600 font-mono whitespace-pre-wrap"
                  >
                    {store.image.logs.join("\n")}
                  </pre>
                </div>
              )}

              {/* Result */}
              {store.image.result && (
                <div>
                  <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                    Generated Image
                  </label>
                  <div className="relative rounded-xl overflow-hidden border border-tiffany-200 shadow-card bg-tiffany-100">
                    <img
                      src={store.image.result}
                      alt="Generated scene"
                      className="w-full h-auto object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ========== VIDEO GENERATION PANEL ========== */
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-2">
                <span className="text-tiffany-500">{VideoIcon}</span>
                <h2 className="text-base font-semibold text-tiffany-900">
                  Scene Video Generation
                </h2>
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                  Input Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="w-full text-sm text-tiffany-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-tiffany-100 file:text-tiffany-700 hover:file:bg-tiffany-200 file:cursor-pointer file:transition-colors"
                />
                <p className="text-xs text-tiffany-600/50 mt-1.5">
                  Upload an image to animate, or generate an image in the Image
                  tab first.
                </p>
                {store.uploading && (
                  <p className="text-xs text-tiffany-600 mt-1">Uploading...</p>
                )}
                {store.uploadError && (
                  <p className="text-xs text-red-600 mt-1">
                    {store.uploadError}
                  </p>
                )}
                {store.uploadedImageUrl && (
                  <div className="mt-3 rounded-xl overflow-hidden border border-tiffany-200 bg-tiffany-100  inline-block">
                    <img
                      src={store.uploadedImageUrl}
                      alt={store.uploadedImageFilename || "Uploaded image"}
                      className="w-full h-32 object-cover"
                    />
                    {store.uploadedImageFilename && (
                      <p className="px-3 py-1.5 text-xs text-tiffany-600 truncate">
                        {store.uploadedImageFilename}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Project images picker */}
              <div>
                <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                  Project Images
                </label>
                {store.projectImagesLoading ? (
                  <p className="text-xs text-tiffany-400 italic py-4 text-center">
                    Loading images...
                  </p>
                ) : store.projectImages.length === 0 ? (
                  <p className="text-xs text-tiffany-400 italic py-4 text-center border border-dashed border-tiffany-200 rounded-xl">
                    No images yet. Upload one above, or generate an image in the
                    Image tab.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                    {store.projectImages.map((img) => {
                      const isSelected =
                        store.selectedImage?.filename === img.filename &&
                        store.selectedImage?.source === img.source;

                      const fullUrl = img.url.startsWith("http")
                        ? img.url
                        : `http://localhost:${(window as any).PORT}${img.url}`;

                      return (
                        <button
                          key={`${img.source}-${img.filename}`}
                          onClick={() => store.selectImage(img)}
                          disabled={store.video.generating}
                          className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected
                              ? "border-tiffany-500 ring-2 ring-tiffany-300/40"
                              : "border-tiffany-200 hover:border-tiffany-300"
                          } disabled:opacity-50`}
                        >
                          <img
                            src={`${fullUrl}`}
                            alt={img.filename}
                            className="w-full h-20 object-cover object-center"
                          />
                          <span className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-tiffany-700 truncate text-center">
                            {img.source === "generated" ? "✦ " : "↑ "}
                            {img.filename}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {store.selectedImage && (
                  <p className="text-xs text-tiffany-600/60 mt-1.5">
                    Selected:{" "}
                    <span className="font-medium text-tiffany-700">
                      {store.selectedImage.filename}
                    </span>
                  </p>
                )}
              </div>

              {/* Prompt */}
              <div>
                <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                  Scene Prompt
                </label>
                <textarea
                  value={store.video.prompt}
                  onChange={(e) => store.setVideoPrompt(e.target.value)}
                  placeholder="Describe the video scene, e.g. a gentle ocean wave rolling onto a sandy beach at golden hour..."
                  rows={4}
                  disabled={store.video.generating}
                  className="w-full px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all resize-none disabled:opacity-50"
                />
              </div>

              {/* Duration selector */}
              <div>
                <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                  Duration (seconds)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[3, 5, 10, 15, 20].map((d) => (
                    <button
                      key={d}
                      onClick={() => store.setVideoDuration(d)}
                      disabled={store.video.generating}
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        store.video.duration === d
                          ? "bg-tiffany-100 border-tiffany-300 text-tiffany-800"
                          : "bg-white border-tiffany-200 text-tiffany-600 hover:border-tiffany-300"
                      } disabled:opacity-50`}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button (video) */}
              <button
                onClick={handleGenerateVideo}
                disabled={
                  store.video.generating ||
                  !store.video.prompt.trim() ||
                  store.uploading
                }
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-600 hover:bg-tiffany-700 active:bg-tiffany-800 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
              >
                {store.video.generating ? (
                  <>
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
                    Generating...
                  </>
                ) : (
                  <>
                    {SparkleIcon}
                    Generate Video
                  </>
                )}
              </button>

              {/* Error */}
              {store.video.error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {store.video.error}
                </div>
              )}

              {/* Logs */}
              {store.video.logs.length > 0 && (
                <div className="p-4 bg-tiffany-50 border border-tiffany-200 rounded-xl max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                    Logs
                  </p>
                  <pre
                    ref={videoLogRef}
                    className="text-xs text-tiffany-600 font-mono whitespace-pre-wrap"
                  >
                    {store.video.logs.join("\n")}
                  </pre>
                </div>
              )}

              {/* Result */}
              {store.video.result && (
                <div>
                  <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                    Generated Video
                  </label>
                  <div className="relative rounded-xl overflow-hidden border border-tiffany-200 shadow-card bg-black">
                    <video
                      src={store.video.result}
                      controls
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
