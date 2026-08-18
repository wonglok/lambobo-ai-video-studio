import { useEffect, useRef } from "react";
import { useGenerationStore } from "../../stores/generationStore";
import { useProjectStore } from "../../stores/projectStore";

interface Props {
  projectId: string;
}

export default function GenerateImageTab({ projectId }: Props) {
  const store = useGenerationStore();
  const { openFolder } = useProjectStore();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const characterFileRef = useRef<HTMLInputElement>(null);
  const imageLogRef = useRef<HTMLPreElement | any>(null);

  const uploadedImages = store.projectImages.filter(
    (img) => img.source === "upload",
  );

  useEffect(() => {
    store.checkMlxgenStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleCharacterUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const uploadedPath = await store.uploadImage(
        projectId,
        base64,
        file.name,
      );
      if (uploadedPath) {
        await store.fetchProjectImages(projectId);
        const { uploadedImageFilename, uploadedImageUrl } =
          useGenerationStore.getState();
        store.selectCharacterImage({
          filename: uploadedImageFilename || file.name,
          url: uploadedImageUrl || "",
          source: "upload",
        });
      }
    };
    reader.readAsDataURL(file);

    e.target.value = "";
  };

  const handleOpenOutputFolder = async () => {
    await openFolder(projectId, "output");
  };

  // ========== SVG Icons ==========

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

  const ImageEditIcon = (
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
      <path d="M11 19H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
      <path d="M13 5h7a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-7" />
      <path d="M2 12h20" />
      <path d="M11 8v3" />
      <path d="M11 13v3" />
    </svg>
  );

  const InstallIcon = (
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
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
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

  const SpinnerIcon = (
    <svg
      className="animate-spin text-ink-400"
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

  const CheckCircleIcon = (
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
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );

  const AlertCircleIcon = (
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );

  const busy =
    store.imageEdit.generating ||
    store.imageEdit.installing ||
    store.imageEdit.downloading ||
    store.batchRunning;

  const renderStatus = (
    value: boolean | null,
    okText: string,
    missingText: string,
  ) => {
    if (value === null) {
      return (
        <span className="inline-flex items-center gap-1.5 text-ink-400">
          {SpinnerIcon}
          Checking...
        </span>
      );
    }
    if (value) {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-400">
          {CheckCircleIcon}
          {okText}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-400">
        {AlertCircleIcon}
        {missingText}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-ink-400">{ImageEditIcon}</span>
        <h2 className="text-base font-semibold text-ink-50">
          Generate Image
        </h2>
      </div>

      {/* ===== Setup: install + download model ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
          Model Setup
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => store.installMlxGen()}
            disabled={store.imageEdit.installing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-all bg-ink-800 border-ink-600 text-ink-300 hover:border-ink-400 disabled:opacity-50"
          >
            {store.imageEdit.installing ? SpinnerIcon : InstallIcon}
            Install mlx-gen
          </button>
          <button
            onClick={() => store.downloadMlxGenModel()}
            disabled={store.imageEdit.downloading}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-all bg-ink-800 border-ink-600 text-ink-300 hover:border-ink-400 disabled:opacity-50"
          >
            {store.imageEdit.downloading ? SpinnerIcon : DownloadIcon}
            Download Model
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs font-medium">
          {renderStatus(
            store.imageEdit.mlxgenInstalled,
            "mlx-gen installed",
            "mlx-gen not installed",
          )}
          {renderStatus(
            store.imageEdit.modelDownloaded,
            "Model downloaded",
            "Model not downloaded",
          )}
        </div>

        {store.imageEdit.installingLogs.length > 0 && (
          <div className="mt-2 p-3 bg-ink-900 border border-ink-600 rounded-xl max-h-32 overflow-y-auto">
            <pre className="text-xs text-ink-300 font-mono whitespace-pre-wrap">
              {store.imageEdit.installingLogs.join("")}
            </pre>
          </div>
        )}
        {store.imageEdit.installingError && (
          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs">
            {store.imageEdit.installingError}
          </div>
        )}

        {store.imageEdit.downloadingLogs.length > 0 && (
          <div className="mt-2 p-3 bg-ink-900 border border-ink-600 rounded-xl max-h-32 overflow-y-auto">
            <pre className="text-xs text-ink-300 font-mono whitespace-pre-wrap">
              {store.imageEdit.downloadingLogs.join("")}
            </pre>
          </div>
        )}
        {store.imageEdit.downloadingError && (
          <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs">
            {store.imageEdit.downloadingError}
          </div>
        )}
      </div>

      {/* ===== Character image picker ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
          Character Image
        </label>
        <input
          ref={characterFileRef}
          type="file"
          accept="image/*"
          onChange={handleCharacterUpload}
          disabled={store.uploading}
          className="inline-block text-sm text-ink-200 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-ink-700 file:text-ink-200 hover:file:bg-ink-600 file:cursor-pointer file:transition-colors disabled:opacity-50"
        />
        {store.uploading && (
          <p className="text-xs text-ink-300 mt-1">Uploading...</p>
        )}
        {store.uploadError && (
          <p className="text-xs text-red-300 mt-1">{store.uploadError}</p>
        )}
        {store.projectImagesLoading ? (
          <p className="text-xs text-ink-400 italic py-4 text-center">
            Loading images...
          </p>
        ) : uploadedImages.length === 0 ? (
          <p className="text-xs text-ink-400 italic py-4 text-center border border-dashed border-ink-600 rounded-xl">
            No uploaded images yet. Upload a character image above.
          </p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-2 p-1">
            {uploadedImages.map((img) => {
              const isSelected =
                store.imageEdit.characterImage?.filename === img.filename;
              const fullUrl = img.url.startsWith("http")
                ? img.url
                : `http://localhost:${(window as any).PORT}${img.url}`;
              return (
                <button
                  key={`${img.source}-${img.filename}`}
                  onClick={() => store.selectCharacterImage(img)}
                  disabled={store.imageEdit.generating}
                  className={`relative rounded-lg border-2 transition-all ${
                    isSelected
                      ? "border-tiffany-400 ring-2 ring-tiffany-400/40"
                      : "border-ink-600 hover:border-ink-400"
                  } disabled:opacity-50`}
                >
                  <img
                    src={fullUrl}
                    alt={img.filename}
                    className="aspect-square object-cover object-center"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-ink-800/80 backdrop-blur-sm px-1.5 py-0.5 text-[10px] text-ink-200 truncate text-center">
                    {img.filename}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {store.imageEdit.characterImage && (
          <p className="text-xs text-ink-300/60 mt-1.5">
            Selected:{" "}
            <span className="font-medium text-ink-200">
              {store.imageEdit.characterImage.filename}
            </span>
          </p>
        )}
      </div>

      {/* ===== Output Size ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
          Output Size
        </label>
        <div className="flex flex-wrap gap-2">
          {[320, 480, 512, 640, 1024, 1500, 2048].map((size) => {
            const isSelected = store.imageEdit.outputSize === size;
            return (
              <button
                key={size}
                onClick={() => store.setImageEditOutputSize(size)}
                disabled={store.imageEdit.generating || store.batchRunning}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  isSelected
                    ? "bg-tiffany-500 text-ink-950 border-tiffany-400"
                    : "bg-ink-800 text-ink-300 border-ink-600 hover:border-ink-400"
                } disabled:opacity-50`}
              >
                {size}px
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== CSV batch ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
          CSV Batch Data
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvSelect}
            disabled={store.batchRunning}
            className="flex-1 text-sm text-ink-200 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-ink-700 file:text-ink-200 hover:file:bg-ink-600 file:cursor-pointer file:transition-colors disabled:opacity-50"
          />
          {store.csvFilename && (
            <button
              onClick={() => store.clearCsvData()}
              disabled={store.batchRunning}
              className="px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
        <a
          href={(() => {
            const csv = `id,scene
1,the character is at AI Chip lab
2,the character is in a spaceship
3,the character is at the beach`;
            return `data:text/csv;charset=utf-8,${encodeURIComponent(csv.trim())}`;
          })()}
          download="image-scenes.csv"
          className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-ink-300 hover:text-ink-50 transition-colors"
        >
          {DownloadIcon}
          Download example CSV file
        </a>

        {store.csvFilename && (
          <div className="mt-2 border border-ink-600 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-ink-900 border-b border-ink-600">
              <div className="flex items-center gap-2 text-xs text-ink-200">
                {CsvIcon}
                <span className="font-medium">{store.csvFilename}</span>
                <span className="text-ink-300/60">
                  ({store.csvRows.length} rows, {store.csvColumns.length}{" "}
                  columns)
                </span>
                <span className="text-ink-300/60">
                  — {store.csvSelectedIndices.size} selected
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => store.selectAllCsvRows()}
                  disabled={store.batchRunning}
                  className="px-2 py-1 text-[10px] font-medium text-ink-300 hover:bg-ink-600 rounded transition-colors disabled:opacity-50"
                >
                  Select All
                </button>
                <button
                  onClick={() => store.deselectAllCsvRows()}
                  disabled={store.batchRunning}
                  className="px-2 py-1 text-[10px] font-medium text-ink-300 hover:bg-ink-600 rounded transition-colors disabled:opacity-50"
                >
                  Deselect All
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-ink-900/50 border-b border-ink-700">
                    <th className="sticky top-0 bg-ink-900 px-3 py-2 text-left font-semibold text-ink-200 w-10">
                      <span className="sr-only">Select</span>
                    </th>
                    {store.csvColumns.map((col) => (
                      <th
                        key={col}
                        className="sticky top-0 bg-ink-900 px-3 py-2 text-left font-semibold text-ink-200 whitespace-nowrap"
                      >
                        {col}
                        <span className="ml-1 text-[10px] font-normal text-ink-400">{`{{${col}}}`}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {store.csvRows.map((row, rowIdx) => {
                    const isSelected = store.csvSelectedIndices.has(rowIdx);
                    return (
                      <tr
                        key={rowIdx}
                        className={`border-b border-ink-700 transition-colors ${
                          isSelected
                            ? "bg-ink-800"
                            : "bg-ink-900/30 opacity-60"
                        }`}
                      >
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => store.toggleCsvRow(rowIdx)}
                            disabled={store.batchRunning}
                            className="w-3.5 h-3.5 rounded border-ink-500 text-ink-300 focus:ring-tiffany-400 cursor-pointer disabled:opacity-50"
                          />
                        </td>
                        {store.csvColumns.map((col) => (
                          <td key={col} className="px-3 py-1">
                            <input
                              type="text"
                              value={row[col] ?? ""}
                              onChange={(e) =>
                                store.updateCsvCell(rowIdx, col, e.target.value)
                              }
                              disabled={store.batchRunning}
                              className="w-full min-w-[120px] px-2 py-1 bg-transparent border border-transparent hover:border-ink-500 focus:border-tiffany-400 focus:outline-none focus:ring-1 focus:ring-tiffany-400/30 rounded text-ink-100 transition-colors disabled:opacity-50"
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
      </div>

      {/* ===== Prompt ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
          Image Prompt
          {store.csvColumns.length > 0 && (
            <span className="ml-2 text-[10px] font-normal text-ink-400">
              — template with {`{{column}}`} placeholders
            </span>
          )}
        </label>
        <textarea
          value={store.imageEdit.prompt}
          onChange={(e) => store.setImageEditPrompt(e.target.value)}
          placeholder="Describe the scene, e.g. the character is at AI Chip lab."
          rows={3}
          disabled={store.imageEdit.generating || store.batchRunning}
          className="w-full px-4 py-3 bg-ink-900 border border-ink-600 rounded-xl text-ink-50 text-sm placeholder-ink-400/40 focus:outline-none focus:border-tiffany-400 focus:ring-2 focus:ring-tiffany-400/30 transition-all resize-none disabled:opacity-50"
        />
      </div>

      {/* ===== Batch generate ===== */}
      {store.csvRows.length > 0 && (
        <div className="space-y-2">
          {store.batchProgress && (
            <div className="flex items-center gap-3 p-3 bg-ink-900 border border-ink-600 rounded-xl">
              <span className="text-xs font-medium text-ink-200">
                {store.batchRunning ? "Batch Progress" : "Batch Complete"}
              </span>
              <div className="flex-1 h-2 bg-ink-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-tiffany-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${(store.batchProgress.current / store.batchProgress.total) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-ink-200 tabular-nums">
                {store.batchProgress.current}/{store.batchProgress.total}
              </span>
            </div>
          )}
          {store.batchRunning ? (
            <button
              onClick={() => store.cancelBatch()}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm font-semibold rounded-xl border border-red-500/30 transition-colors"
            >
              Cancel Batch
            </button>
          ) : (
            <button
              onClick={() => store.generateBatchEditedImages(projectId)}
              disabled={
                busy ||
                !store.imageEdit.prompt.trim() ||
                !store.imageEdit.characterImage
              }
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-400 active:bg-tiffany-500 disabled:bg-ink-600 disabled:text-ink-400 text-ink-950 text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
            >
              {TableIcon}
              Generate Batch ({store.csvSelectedIndices.size} images)
            </button>
          )}
        </div>
      )}

      {/* ===== Generate single ===== */}
      {store.imageEdit.generating ? (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 px-4 py-3 bg-ink-900 border border-ink-600 rounded-xl">
            <svg
              className="animate-spin text-ink-400"
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
            <span className="text-sm font-medium text-ink-200">
              Generating...
            </span>
          </div>
          <button
            onClick={() => store.cancelBatch()}
            className="flex items-center justify-center gap-1.5 px-5 py-3 bg-red-500 hover:bg-red-500 active:bg-red-600 text-white text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
            Stop
          </button>
        </div>
      ) : (
        <button
          onClick={() => store.generateEditedImage(projectId)}
          disabled={
            busy ||
            !store.imageEdit.prompt.trim() ||
            !store.imageEdit.characterImage
          }
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-400 active:bg-tiffany-500 disabled:bg-ink-600 disabled:text-ink-400 text-ink-950 text-sm font-semibold rounded-xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate Image
        </button>
      )}

      {/* ===== Show output folder ===== */}
      <button
        onClick={handleOpenOutputFolder}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-ink-900 hover:bg-ink-600 text-ink-200 text-sm font-medium rounded-xl border border-ink-600 transition-colors"
      >
        {FolderIcon}
        Show Output Folder
      </button>

      {/* ===== Error ===== */}
      {store.imageEdit.error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {store.imageEdit.error}
        </div>
      )}

      {/* ===== Logs ===== */}
      {store.imageEdit.logs.length > 0 && (
        <div
          ref={imageLogRef}
          className="p-4 bg-ink-900 border border-ink-600 rounded-xl max-h-40 overflow-y-auto"
        >
          <p className="text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
            Logs
          </p>
          <pre className="text-xs text-ink-300 font-mono whitespace-pre-wrap">
            {store.imageEdit.logs.join("")}
          </pre>
        </div>
      )}

      {/* ===== Result ===== */}
      {store.imageEdit.result && (
        <div>
          <label className="block text-xs font-semibold text-ink-200 uppercase tracking-wider mb-2">
            Generated Image
          </label>
          <div className="rounded-xl overflow-hidden border border-ink-600 shadow-card inline-block">
            <img
              src={store.imageEdit.result}
              alt="Generated"
              className="max-w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
