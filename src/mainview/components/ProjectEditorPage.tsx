import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";
import { useGenerationStore } from "../stores/generationStore";

export default function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, fetchProjects, openFolder } = useProjectStore();
  const [project, setProject] = useState<Project | null>(null);

  // Zustand generation store
  const store = useGenerationStore();

  // Local refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const videoLogRef = useRef<HTMLPreElement | any>(null);

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, []);

  useEffect(() => {
    const found = projects.find((p) => p.id === id) || null;
    setProject(found);
  }, [id, projects]);

  useEffect(() => {
    if (videoLogRef.current) {
      videoLogRef.current.scrollTop = 100000;
    }
  }, [store.video.logs]);

  useEffect(() => {
    let ttt = setInterval(() => {
      let dom = document.querySelector("#video-logs");
      if (dom) {
        dom.scrollTop = 99999999;
      }
    });

    return () => {
      clearInterval(ttt);
    };
  }, []);

  // Fetch project images on mount
  useEffect(() => {
    if (id) {
      store.fetchProjectImages(id);
    }
  }, [id]);

  // ========== Handlers ==========

  const handleGenerateVideo = async () => {
    if (id) {
      await store.generateVideo(id);
      document.body.scrollTop = 99999999999;
    }
  };

  const handleBatchGenerate = async () => {
    if (id) {
      await store.generateBatchVideos(id);
    }
  };

  const handleOpenVideoFolder = async () => {
    if (!id) return;
    await openFolder(id, "output");
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

  const handleCsvSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      store.uploadCsv(base64, file.name);
    };
    reader.readAsDataURL(file);

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

  const FolderIcon = (
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
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  const CsvIcon = (
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
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );

  const TableIcon = (
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );

  const DownloadIcon = (
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
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
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
      <div className="flex items-center gap-4 px-6 py-4 bg-white border-b border-tiffany-100  mb-6">
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

      {/* Content */}
      <div className="flex-1 px-6 pb-6">
        <div className="bg-white border border-tiffany-200 rounded-2xl shadow-card p-6 min-h-full">
          {/* ========== VIDEO GENERATION PANEL ========== */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <span className="text-tiffany-500">{VideoIcon}</span>
              <h2 className="text-base font-semibold text-tiffany-900">
                Scene Video Generation
              </h2>
            </div>

            {/* CSV upload for batch generation */}
            <div>
              <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                CSV Batch Data
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvSelect}
                  disabled={store.batchRunning}
                  className="flex-1 text-sm text-tiffany-700 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-tiffany-100 file:text-tiffany-700 hover:file:bg-tiffany-200 file:cursor-pointer file:transition-colors disabled:opacity-50"
                />
                {store.csvFilename && (
                  <button
                    onClick={() => store.clearCsvData()}
                    disabled={store.batchRunning}
                    className="px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              {store.csvFilename && (
                <div className="mt-2 border border-tiffany-200 rounded-xl overflow-hidden">
                  {/* CSV header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-tiffany-50 border-b border-tiffany-200">
                    <div className="flex items-center gap-2 text-xs text-tiffany-700">
                      {CsvIcon}
                      <span className="font-medium">{store.csvFilename}</span>
                      <span className="text-tiffany-600/60">
                        ({store.csvRows.length} rows, {store.csvColumns.length}{" "}
                        columns)
                      </span>
                      <span className="text-tiffany-600/60">
                        — {store.csvSelectedIndices.size} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => store.selectAllCsvRows()}
                        disabled={store.batchRunning}
                        className="px-2 py-1 text-[10px] font-medium text-tiffany-600 hover:bg-tiffany-100 rounded transition-colors disabled:opacity-50"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => store.deselectAllCsvRows()}
                        disabled={store.batchRunning}
                        className="px-2 py-1 text-[10px] font-medium text-tiffany-600 hover:bg-tiffany-100 rounded transition-colors disabled:opacity-50"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Table container with horizontal scroll */}
                  <div className="overflow-auto max-h-80">
                    <table className="w-full text-xs">
                      {/* Column headers */}
                      <thead>
                        <tr className="bg-tiffany-50/50 border-b border-tiffany-100">
                          <th className="sticky top-0 bg-tiffany-50 px-3 py-2 text-left font-semibold text-tiffany-700 w-10">
                            <span className="sr-only">Select</span>
                          </th>
                          {store.csvColumns.map((col) => (
                            <th
                              key={col}
                              className="sticky top-0 bg-tiffany-50 px-3 py-2 text-left font-semibold text-tiffany-700 whitespace-nowrap"
                            >
                              {col}
                              <span className="ml-1 text-[10px] font-normal text-tiffany-400">{`{{${col}}}`}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {store.csvRows.map((row, rowIdx) => {
                          const isSelected =
                            store.csvSelectedIndices.has(rowIdx);
                          return (
                            <tr
                              key={rowIdx}
                              className={`border-b border-tiffany-100 transition-colors ${
                                isSelected
                                  ? "bg-white"
                                  : "bg-tiffany-50/30 opacity-60"
                              }`}
                            >
                              <td className="px-3 py-1.5">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => store.toggleCsvRow(rowIdx)}
                                  disabled={store.batchRunning}
                                  className="w-3.5 h-3.5 rounded border-tiffany-300 text-tiffany-600 focus:ring-tiffany-500 cursor-pointer disabled:opacity-50"
                                />
                              </td>
                              {store.csvColumns.map((col) => (
                                <td key={col} className="px-3 py-1">
                                  <input
                                    type="text"
                                    value={row[col] ?? ""}
                                    onChange={(e) =>
                                      store.updateCsvCell(
                                        rowIdx,
                                        col,
                                        e.target.value,
                                      )
                                    }
                                    disabled={store.batchRunning}
                                    className="w-full min-w-[120px] px-2 py-1 bg-transparent border border-transparent hover:border-tiffany-200 focus:border-tiffany-300 focus:outline-none focus:ring-1 focus:ring-tiffany-300/30 rounded text-tiffany-800 transition-colors disabled:opacity-50"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!store.csvFilename && (
                <p className="text-xs text-tiffany-600/50 mt-1.5">
                  Upload a CSV with a{" "}
                  <code className="text-[11px] bg-tiffany-100 px-1 rounded">
                    name
                  </code>{" "}
                  column to batch-generate many videos. Use{" "}
                  <code className="text-[11px] bg-tiffany-100 px-1 rounded">{`{{column}}`}</code>{" "}
                  in your prompt as a template.
                </p>
              )}
              <a
                href={(() => {
                  const csv = `id,book,chapter,verses,script
1,Ephesians,4,32,"Be kind to one another, tenderhearted, forgiving one another, as God in Christ forgave you."
2,Colossians,3,13,Bear with each other and forgive one another if any of you has a grievance against someone. Forgive as the Lord forgave you.
3,Matthew,6,14,"For if you forgive other people when they sin against you, your heavenly Father will also forgive you."
4,Luke,6,37,"Do not judge, and you will not be judged. Do not condemn, and you will not be condemned. Forgive, and you will be forgiven."
5,Mark,11,25,"And whenever you stand praying, forgive, if you have anything against anyone, so that your Father also who is in heaven may forgive you."
6,1 John,1,9,"If we confess our sins, he is faithful and just to forgive us our sins and to cleanse us from all unrighteousness."
7,Psalm,103,12,"As far as the east is from the west, so far has he removed our transgressions from us."
8,Proverbs,17,9,"Whoever would foster love covers over an offense, but whoever repeats the matter separates close friends."
9,Psalm,86,5,"For you, O Lord, are good and forgiving, abounding in steadfast love to all who call upon you."
10,Isaiah,43,25,"I, even I, am he who blots out your transgressions, for my own sake, and remembers your sins no more."`;
                  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv.trim())}`;
                })()}
                download="bible.csv"
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-tiffany-600 hover:text-tiffany-800 transition-colors"
              >
                {DownloadIcon}
                Download example CSV file
              </a>
            </div>
            {/*  */}
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
                Upload an image to animate.
              </p>

              <a
                href={`/lambobo.png.zip`}
                download="lambobo.zip"
                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-tiffany-600 hover:text-tiffany-800 transition-colors"
              >
                {DownloadIcon}
                Download example image file
              </a>
              <br />

              {store.uploading && (
                <p className="text-xs text-tiffany-600 mt-1">Uploading...</p>
              )}
              {store.uploadError && (
                <p className="text-xs text-red-600 mt-1">{store.uploadError}</p>
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
                  No images yet. Upload one above.
                </p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 gap-2 p-1">
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
                        className={`relative rounded-lg border-2 transition-all ${
                          isSelected
                            ? "border-tiffany-500 ring-2 ring-tiffany-300/40"
                            : "border-tiffany-200 hover:border-tiffany-300"
                        } disabled:opacity-50`}
                      >
                        <img
                          src={`${fullUrl}`}
                          alt={img.filename}
                          className="aspect-square object-cover object-center"
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
                {store.csvColumns.length > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-tiffany-500">
                    — template with {`{{column}}`} placeholders
                  </span>
                )}
              </label>
              <textarea
                value={store.video.prompt}
                onChange={(e) => store.setVideoPrompt(e.target.value)}
                placeholder={
                  store.csvColumns.length > 0
                    ? `Use {{name}} and other column placeholders, e.g. a {{name}} says: "Hi John Wayne, how are you? my name is {{name}}."`
                    : "Describe the video scene, e.g. a gentle ocean wave rolling onto a sandy beach at golden hour..."
                }
                rows={4}
                disabled={store.video.generating || store.batchRunning}
                className="w-full px-4 py-3 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all resize-none disabled:opacity-50"
              />
            </div>

            {/* Duration selector */}
            <div>
              <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                Duration (seconds)
              </label>
              <div className="flex flex-wrap gap-2">
                {[3, 5, 7.5, 10, 12.5, 15, 17.5, 20].map((d) => (
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

            {/* Aspect Ratio selector */}
            <div>
              <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                Aspect Ratio
              </label>
              <div className="flex flex-wrap gap-2">
                {(["1:1", "16:9", "9:16", "4:3", "3:4"] as const).map(
                  (ratio) => (
                    <button
                      key={ratio}
                      onClick={() => store.setVideoAspectRatio(ratio)}
                      disabled={store.video.generating}
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        store.video.aspectRatio === ratio
                          ? "bg-tiffany-100 border-tiffany-300 text-tiffany-800"
                          : "bg-white border-tiffany-200 text-tiffany-600 hover:border-tiffany-300"
                      } disabled:opacity-50`}
                    >
                      {ratio}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Resolution selector */}
            <div>
              <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                Resolution
              </label>
              <div className="flex flex-wrap gap-2">
                {(["320p", "480p", "576p", "640p", "720p"] as const).map(
                  (res: any) => (
                    <button
                      key={res}
                      onClick={() => store.setVideoResolution(res)}
                      disabled={store.video.generating}
                      className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        store.video.resolution === res
                          ? "bg-tiffany-100 border-tiffany-300 text-tiffany-800"
                          : "bg-white border-tiffany-200 text-tiffany-600 hover:border-tiffany-300"
                      } disabled:opacity-50`}
                    >
                      {res}
                    </button>
                  ),
                )}
              </div>
            </div>

            <button
              onClick={handleOpenVideoFolder}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 mb-3 bg-tiffany-50 hover:bg-tiffany-100 text-tiffany-700 text-sm font-medium rounded-xl border border-tiffany-200 transition-colors"
            >
              {FolderIcon}
              Open Output Folder
            </button>

            {/* Batch generate button */}
            {store.csvRows.length > 0 && (
              <div className="space-y-2">
                {store.batchProgress && (
                  <div className="flex items-center gap-3 p-3 bg-tiffany-50 border border-tiffany-200 rounded-xl">
                    <span className="text-xs font-medium text-tiffany-700">
                      {store.batchRunning ? "Batch Progress" : "Batch Complete"}
                    </span>
                    <div className="flex-1 h-2 bg-tiffany-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${(store.batchProgress.current / store.batchProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-tiffany-700 tabular-nums">
                      {store.batchProgress.current}/{store.batchProgress.total}
                    </span>
                  </div>
                )}
                {store.batchRunning ? (
                  <button
                    onClick={() => {
                      store.cancelBatch();
                      store.cancelGenerate();
                    }}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl border border-red-200 transition-colors"
                  >
                    Cancel Batch
                  </button>
                ) : (
                  <button
                    onClick={handleBatchGenerate}
                    disabled={
                      store.video.generating ||
                      !store.video.prompt.trim() ||
                      store.uploading
                    }
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
                  >
                    {TableIcon}
                    Generate Batch ({store.csvSelectedIndices.size} videos)
                  </button>
                )}
              </div>
            )}

            {/* Generate / Stop button (video) */}
            {store.video.generating ? (
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
                  onClick={() => {
                    store.cancelBatch();
                    store.cancelGenerate();
                  }}
                  className="flex items-center justify-center gap-1.5 px-5 py-3 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  Stop
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateVideo}
                disabled={
                  store.batchRunning ||
                  !store.video.prompt.trim() ||
                  store.uploading
                }
                className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-600 hover:bg-tiffany-700 active:bg-tiffany-800 disabled:bg-tiffany-200 disabled:text-tiffany-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
              >
                {SparkleIcon}
                {`Generate 1 Video (No CSV / Template support)`}
              </button>
            )}

            {/* Error */}
            {store.video.error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {store.video.error}
              </div>
            )}

            {/* Logs */}
            {store.video.logs.length > 0 && (
              <div
                ref={videoLogRef}
                className="p-4 bg-tiffany-50 border border-tiffany-200 rounded-xl max-h-40 overflow-y-auto"
              >
                <p className="text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
                  Logs
                </p>
                <pre className="text-xs text-tiffany-600 font-mono whitespace-pre-wrap">
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

                <div className="relative rounded-xl overflow-hidden border border-tiffany-200 shadow-card bg-black w-[500px]">
                  <video
                    src={store.video.result}
                    controls
                    className="w-full h-auto"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
