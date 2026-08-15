import { useEffect, useRef, useState } from "react";
import {
  useStoryStore,
  type Story,
  type StoryCharacter,
} from "../../stores/storyStore";
import { useGenerationStore } from "../../stores/generationStore";
import CropTool from "./CropTool";

const API_BASE = `http://localhost:${(window as any).PORT}`;

interface Props {
  projectId: string;
}

export default function StoryWizardTab({ projectId }: Props) {
  const storiesStore = useStoryStore();
  const gen = useGenerationStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storiesStore.fetchStories(projectId);
    gen.fetchProjectImages(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const currentStory =
    storiesStore.stories.find((s) => s.id === currentStoryId) ?? null;

  const charUrl = (c: StoryCharacter | null): string | null => {
    if (!c) return null;
    const img = gen.projectImages.find(
      (i) => i.filename === c.filename && i.source === c.source,
    );
    if (!img) return null;
    return img.url.startsWith("http") ? img.url : `${API_BASE}${img.url}`;
  };

  const handleCreate = async () => {
    const title = titleDraft.trim();
    if (!title) return;
    await storiesStore.createStory(projectId, title);
    setTitleDraft("");
    setShowCreate(false);
  };

  const handleRename = async (s: Story) => {
    const title = renameDraft.trim();
    if (!title) return;
    await storiesStore.updateStory(s.id, { title });
    setRenamingId(null);
    setRenameDraft("");
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    await storiesStore.deleteStory(confirmDeleteId);
    setConfirmDeleteId(null);
    if (currentStoryId === confirmDeleteId) {
      setCurrentStoryId(null);
      setStep(1);
    }
  };

  const openCharacter = (s: Story) => {
    setCurrentStoryId(s.id);
    setPendingImage(null);
    setShowPicker(false);
    setError(null);
    setStep(2);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result as string);
      setShowPicker(false);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const saveCharacter = async (dataUrl: string) => {
    if (!currentStoryId) return;
    setUploading(true);
    setError(null);
    try {
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
      const current = storiesStore.stories.find((s) => s.id === currentStoryId);
      const characters = current?.characters ?? [];
      await storiesStore.updateStory(currentStoryId, {
        characters: [...characters, { filename: data.filename, source: "upload" }],
      });
      await gen.fetchProjectImages(projectId);
      setPendingImage(null);
      setShowPicker(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  const removeCharacter = async (filename: string) => {
    if (!currentStory) return;
    await storiesStore.updateStory(currentStory.id, {
      characters: currentStory.characters.filter(
        (c) => c.filename !== filename,
      ),
    });
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
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );

  const PlusIcon = (
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
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

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
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );

  const PencilIcon = (
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );

  const TrashIcon = (
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
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const CharacterIcon = (
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

  const CloseIcon = (
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );

  // ========== Step 1: Story list ==========

  if (step === 1) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-tiffany-500">{BookIcon}</span>
            <h2 className="text-base font-semibold text-tiffany-900">
              Story Wizard
            </h2>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-tiffany-200 bg-white text-tiffany-600 hover:border-tiffany-300 transition-colors"
          >
            {PlusIcon}
            New Story
          </button>
        </div>

        {showCreate && (
          <div className="flex items-center gap-2 p-3 border border-tiffany-200 rounded-xl bg-tiffany-50/40">
            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowCreate(false);
              }}
              autoFocus
              placeholder="Story title"
              className="flex-1 px-3 py-2 bg-white border border-tiffany-200 rounded-lg text-sm text-tiffany-900 placeholder-tiffany-400 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30"
            />
            <button
              onClick={handleCreate}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-tiffany-500 hover:bg-tiffany-600 text-white transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-tiffany-200 text-tiffany-600 hover:bg-tiffany-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {storiesStore.loading ? (
          <p className="text-xs text-tiffany-400 italic text-center py-8">
            Loading stories...
          </p>
        ) : storiesStore.stories.length === 0 ? (
          <p className="text-xs text-tiffany-400 italic text-center py-8 border border-dashed border-tiffany-200 rounded-xl">
            No stories yet. Create your first story.
          </p>
        ) : (
          <ul className="divide-y divide-tiffany-100 border border-tiffany-200 rounded-xl overflow-hidden">
            {storiesStore.stories.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-tiffany-50/60 transition-colors"
              >
                <div className="flex -space-x-2">
                  {s.characters.length > 0 ? (
                    <>
                      {s.characters.slice(0, 3).map((c) => {
                        const url = charUrl(c);
                        return url ? (
                          <img
                            key={c.filename}
                            src={url}
                            alt={c.filename}
                            title={c.filename}
                            className="w-10 h-10 rounded-lg object-cover border-2 border-white"
                          />
                        ) : (
                          <div
                            key={c.filename}
                            className="w-10 h-10 rounded-lg bg-tiffany-100 border-2 border-white flex items-center justify-center text-tiffany-400"
                          >
                            {CharacterIcon}
                          </div>
                        );
                      })}
                      {s.characters.length > 3 && (
                        <span className="self-center ml-1 text-[10px] text-tiffany-500">
                          +{s.characters.length - 3}
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-tiffany-100 flex items-center justify-center text-tiffany-400">
                      {CharacterIcon}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {renamingId === s.id ? (
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(s);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                      className="w-full px-2 py-1 bg-white border border-tiffany-300 rounded text-sm text-tiffany-900 focus:outline-none focus:ring-1 focus:ring-tiffany-300"
                    />
                  ) : (
                    <p className="text-sm text-tiffany-800 truncate">
                      {s.title}
                    </p>
                  )}
                  <p className="text-[11px] text-tiffany-400">
                    {s.scenes.length} scenes · updated{" "}
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </p>
                </div>

                {renamingId === s.id ? (
                  <button
                    onClick={() => handleRename(s)}
                    className="px-2 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                  >
                    Save
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => openCharacter(s)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-tiffany-200 text-tiffany-600 hover:border-tiffany-300 transition-colors"
                      title="Set character"
                    >
                      {CharacterIcon}
                      Character
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(s.id);
                        setRenameDraft(s.title);
                      }}
                      className="p-1.5 text-tiffany-500 hover:bg-tiffany-100 rounded transition-colors"
                      title="Rename"
                    >
                      {PencilIcon}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="p-1.5 text-red-400 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      {TrashIcon}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Delete confirmation modal */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-2xl shadow-card p-5 w-80">
              <h3 className="text-sm font-semibold text-tiffany-900 mb-2">
                Delete Story
              </h3>
              <p className="text-xs text-tiffany-600 mb-4">
                Are you sure you want to delete this story?
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

  // ========== Step 2: Character ==========

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setStep(1);
            setPendingImage(null);
            setShowPicker(false);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-tiffany-200 text-tiffany-600 hover:bg-tiffany-50 transition-colors"
        >
          {BackIcon}
          Back
        </button>
        <h2 className="text-base font-semibold text-tiffany-900 truncate">
          {currentStory?.title ?? "Story"}
        </h2>
      </div>

      {currentStory && currentStory.characters.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
            Characters ({currentStory.characters.length})
          </label>
          <div className="flex flex-wrap gap-2">
            {currentStory.characters.map((c) => (
              <div
                key={c.filename}
                className="relative rounded-lg border border-tiffany-200 overflow-hidden"
              >
                {charUrl(c) ? (
                  <img
                    src={charUrl(c)!}
                    alt={c.filename}
                    className="w-16 h-16 object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 bg-tiffany-100 flex items-center justify-center text-tiffany-400">
                    {CharacterIcon}
                  </div>
                )}
                <button
                  onClick={() => removeCharacter(c.filename)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                  title="Remove character"
                >
                  {CloseIcon}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-tiffany-200 bg-white text-tiffany-600 hover:border-tiffany-300 transition-colors"
        >
          {UploadIcon}
          Upload Image
        </button>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-tiffany-200 bg-white text-tiffany-600 hover:border-tiffany-300 transition-colors"
        >
          {CharacterIcon}
          Pick from Project
        </button>
      </div>

      {showPicker && !pendingImage && (
        <div>
          <label className="block text-xs font-semibold text-tiffany-700 uppercase tracking-wider mb-2">
            Project Images
          </label>
          {gen.projectImagesLoading ? (
            <p className="text-xs text-tiffany-400 italic py-4 text-center">
              Loading images...
            </p>
          ) : gen.projectImages.length === 0 ? (
            <p className="text-xs text-tiffany-400 italic py-4 text-center border border-dashed border-tiffany-200 rounded-xl">
              No project images yet.
            </p>
          ) : (
            <div className="grid grid-cols-4 xl:grid-cols-6 gap-2">
              {gen.projectImages.map((img) => {
                const fullUrl = img.url.startsWith("http")
                  ? img.url
                  : `${API_BASE}${img.url}`;
                return (
                  <button
                    key={`${img.source}-${img.filename}`}
                    onClick={() => {
                      setPendingImage(fullUrl);
                      setShowPicker(false);
                    }}
                    className="rounded-lg border-2 border-tiffany-200 hover:border-tiffany-300 transition-all overflow-hidden"
                  >
                    <img
                      src={fullUrl}
                      alt={img.filename}
                      className="aspect-square object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {pendingImage && (
        <CropTool
          image={pendingImage}
          onCancel={() => setPendingImage(null)}
          onApply={saveCharacter}
        />
      )}

      {uploading && (
        <p className="text-xs text-tiffany-600">Saving character...</p>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
