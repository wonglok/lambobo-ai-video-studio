import { useEffect } from "react";
import { useMovieStudioStore } from "../../stores/movieStudioStore";
import { useGenerationStore } from "../../stores/generationStore";

interface Props {
  projectId: string;
}

export default function MovieStudioTab({ projectId }: Props) {
  const store = useMovieStudioStore();
  const gen = useGenerationStore();
  const model = gen.agent.model;

  // Reset the idea/result when switching projects.
  useEffect(() => {
    store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ========== SVG Icons ==========

  const ClapperIcon = (
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
      <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
      <path d="m6.2 5.3 3.1 3.9" />
      <path d="m12.4 3.4 3.1 4" />
      <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
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

  const SpinnerIcon = (
    <svg
      className="animate-spin text-tiffany-600"
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

  const TableHead = ({
    columns,
  }: {
    columns: { key: string; label: string; className?: string }[];
  }) => (
    <thead className="bg-ink-50">
      <tr className="border-b border-ink-200">
        {columns.map((c) => (
          <th
            key={c.key}
            className={`border border-ink-200 px-2 py-1.5 text-left font-semibold text-ink-700 whitespace-nowrap ${
              c.className ?? ""
            }`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  );

  const PromptCell = ({ text }: { text: string }) => (
    <span className="text-ink-700 whitespace-pre-wrap leading-relaxed">
      {text}
    </span>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-600">{ClapperIcon}</span>
        <h2 className="text-base font-semibold text-ink-900">Movie Studio</h2>
      </div>

      {/* ===== Idea box ===== */}
      <div>
        <label className="block text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
          Story Idea
        </label>
        <textarea
          value={store.idea}
          onChange={(e) => store.setIdea(e.target.value)}
          placeholder="Describe your movie or story idea, e.g. A little lamb and a ninja become unlikely friends and open a photo studio together."
          rows={5}
          disabled={store.generating}
          className="w-full px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl text-ink-900 text-sm placeholder-ink-500/40 focus:outline-none focus:border-tiffany-500 focus:ring-2 focus:ring-tiffany-500/30 transition-all resize-none disabled:opacity-50"
        />
        {!gen.agent.serverOnline && (
          <p className="text-xs text-amber-600 mt-1.5">
            The LLM server is not running — start it from the Agent tab first.
          </p>
        )}
      </div>

      {/* ===== Submit ===== */}
      {store.generating ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-ink-50 border border-ink-200 rounded-2xl">
          {SpinnerIcon}
          <span className="text-sm font-medium text-ink-700">
            Generating production bible...
          </span>
        </div>
      ) : (
        <button
          onClick={() => store.generate(model)}
          disabled={!store.idea.trim()}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-tiffany-500 hover:bg-tiffany-600 active:bg-tiffany-700 disabled:bg-ink-200 disabled:text-ink-500 text-ink-950 text-sm font-semibold rounded-2xl transition-all duration-150 shadow-sm hover:shadow-md disabled:shadow-none"
        >
          {SparkleIcon}
          Generate
        </button>
      )}

      {/* ===== Error ===== */}
      {store.error && (
        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl text-red-600 text-sm">
          {store.error}
        </div>
      )}

      {/* ===== Result tables ===== */}
      {store.result && (
        <>
          {/* Characters */}
          <div>
            <h3 className="text-sm font-semibold text-ink-900 mb-2">
              Characters
            </h3>
            {store.result.characters.length === 0 ? (
              <p className="text-xs text-ink-500 italic py-3 border border-dashed border-ink-200 rounded-2xl text-center">
                No characters found.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-200">
                <table className="w-full border-collapse text-xs">
                  <TableHead
                    columns={[
                      { key: "slug", label: "Slug", className: "w-32" },
                      { key: "name", label: "Name", className: "w-40" },
                      { key: "prompt", label: "Image Prompt" },
                    ]}
                  />
                  <tbody>
                    {store.result.characters.map((c) => (
                      <tr key={c.slug} className="border-b border-ink-200">
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-tiffany-700">
                          {c.slug}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-medium text-ink-800">
                          {c.name}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top">
                          <PromptCell text={c.imagePrompt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Places */}
          <div>
            <h3 className="text-sm font-semibold text-ink-900 mb-2">Places</h3>
            {store.result.places.length === 0 ? (
              <p className="text-xs text-ink-500 italic py-3 border border-dashed border-ink-200 rounded-2xl text-center">
                No places found.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-200">
                <table className="w-full border-collapse text-xs">
                  <TableHead
                    columns={[
                      { key: "slug", label: "Slug", className: "w-32" },
                      { key: "name", label: "Name", className: "w-40" },
                      { key: "prompt", label: "Image Prompt" },
                    ]}
                  />
                  <tbody>
                    {store.result.places.map((p) => (
                      <tr key={p.slug} className="border-b border-ink-200">
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-tiffany-700">
                          {p.slug}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-medium text-ink-800">
                          {p.name}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top">
                          <PromptCell text={p.imagePrompt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Scenes */}
          <div>
            <h3 className="text-sm font-semibold text-ink-900 mb-2">Scenes</h3>
            {store.result.scenes.length === 0 ? (
              <p className="text-xs text-ink-500 italic py-3 border border-dashed border-ink-200 rounded-2xl text-center">
                No scenes found.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-ink-200">
                <table className="w-full border-collapse text-xs">
                  <TableHead
                    columns={[
                      { key: "slug", label: "Slug", className: "w-24" },
                      { key: "description", label: "Description", className: "w-48" },
                      { key: "characters", label: "Characters", className: "w-32" },
                      { key: "place", label: "Place", className: "w-28" },
                      { key: "prompt", label: "Image Prompt" },
                    ]}
                  />
                  <tbody>
                    {store.result.scenes.map((s) => (
                      <tr key={s.slug} className="border-b border-ink-200">
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-tiffany-700">
                          {s.slug}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top text-ink-800">
                          {s.description}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-ink-600">
                          {s.characterSlugs.join(", ")}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top font-mono text-[11px] text-ink-600">
                          {s.placeSlug}
                        </td>
                        <td className="border border-ink-200 px-2 py-1.5 align-top">
                          <PromptCell text={s.imagePrompt} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
