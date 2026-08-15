import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";
import { useGenerationStore } from "../stores/generationStore";
import ExtendVideoTab from "./EditorTabs/ExtendVideoTab";
import GenerateImageTab from "./EditorTabs/GenerateImageTab";
import GenerateVideoTab from "./EditorTabs/GenerateVideoTab";
import AgentTab from "./EditorTabs/AgentTab";
import CharactersTab from "./EditorTabs/CharactersTab";
import ExtractImageTab from "./EditorTabs/ExtractImageTab";
import SceneVisualTab from "./EditorTabs/SceneVisualTab";

export default function ProjectEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { projects, fetchProjects } = useProjectStore();
  const [project, setProject] = useState<Project | null>(null);

  // Zustand generation store
  const store = useGenerationStore();

  useEffect(() => {
    if (projects.length === 0) {
      fetchProjects();
    }
  }, []);

  useEffect(() => {
    const found = projects.find((p) => p.id === id) || null;
    setProject(found);
  }, [id, projects]);

  // Fetch project images and videos on mount
  useEffect(() => {
    if (id) {
      store.fetchProjectImages(id);
      store.fetchProjectVideos(id);
    }
  }, [id]);

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

  const AgentIcon = (
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
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="15" cy="9" r="1" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );

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

  const ExtractIcon = (
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
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );

  const SceneVisualIcon = (
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
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
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
          {/* ========== TAB BAR ========== */}
          <div className="flex items-center gap-1 border-b border-tiffany-200 pb-4 mb-2">
            <button
              onClick={() => store.setActiveTab("video")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "video"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {VideoIcon}
              Generate Video
            </button>
            <button
              onClick={() => store.setActiveTab("extend")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "extend"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {ExtendIcon}
              Extend Video
            </button>
            <button
              onClick={() => store.setActiveTab("image")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "image"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {ImageEditIcon}
              Edit Image
            </button>
            <button
              onClick={() => store.setActiveTab("agent")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "agent"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {AgentIcon}
              Agent
            </button>
            <button
              onClick={() => store.setActiveTab("characters")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "characters"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {CharacterIcon}
              Characters
            </button>
            <button
              onClick={() => store.setActiveTab("extract")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "extract"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {ExtractIcon}
              Extract Image
            </button>
            <button
              onClick={() => store.setActiveTab("sceneVisual")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all ${
                store.activeTab === "sceneVisual"
                  ? "bg-tiffany-100 text-tiffany-800"
                  : "text-tiffany-600 hover:bg-tiffany-50 hover:text-tiffany-700"
              }`}
            >
              {SceneVisualIcon}
              Scene Visual
            </button>
          </div>

          {/* ========== IMAGE GENERATION PANEL ========== */}
          {store.activeTab === "image" && <GenerateImageTab projectId={id!} />}

          {/* ========== VIDEO GENERATION PANEL ========== */}
          {store.activeTab === "video" && <GenerateVideoTab projectId={id!} />}

          {/* ========== EXTEND VIDEO PANEL ========== */}
          {store.activeTab === "extend" && <ExtendVideoTab projectId={id!} />}

          {/* ========== AGENT PANEL ========== */}
          {store.activeTab === "agent" && <AgentTab projectId={id!} />}

          {/* ========== CHARACTERS PANEL ========== */}
          {store.activeTab === "characters" && (
            <CharactersTab projectId={id!} />
          )}

          {/* ========== EXTRACT IMAGE PANEL ========== */}
          {store.activeTab === "extract" && (
            <ExtractImageTab projectId={id!} />
          )}

          {/* ========== SCENE VISUAL PANEL ========== */}
          {store.activeTab === "sceneVisual" && (
            <SceneVisualTab projectId={id!} />
          )}
        </div>
      </div>
    </div>
  );
}
