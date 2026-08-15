import { useEffect } from "react";
import { useReferencesToVideoStore } from "../../stores/referencesToVideoStore";
import MlxVlmServerPanel from "./MlxVlmServerPanel";

export default function ReferencesToVideoTab() {
  const store = useReferencesToVideoStore();

  useEffect(() => {
    store.checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        {BookIcon}
        <h2 className="text-base font-semibold text-tiffany-900">
          References to Video
        </h2>
      </div>

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
          {store.downloading ? (
            SpinnerIcon
          ) : store.downloaded ? (
            CheckIcon
          ) : (
            DownloadIcon
          )}
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

      <MlxVlmServerPanel />
    </div>
  );
}
