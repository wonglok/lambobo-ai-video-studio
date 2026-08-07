import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore, type Project } from "../stores/projectStore";

export default function ProjectManager() {
  const navigate = useNavigate();
  const {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    openInFinder,
  } = useProjectStore();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (showCreate && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [showCreate]);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setShowCreate(false);
    setEditingId(null);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    await createProject(formName.trim(), formDesc.trim());
    resetForm();
  };

  const handleUpdate = async () => {
    if (!editingId || !formName.trim()) return;
    await updateProject(editingId, {
      name: formName.trim(),
      description: formDesc.trim(),
    });
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setDeleteConfirm(null);
  };

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setFormName(p.name);
    setFormDesc(p.description);
    setShowCreate(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const openProject = (id: string) => {
    navigate(`/project/${id}`);
  };

  // ========== SVG Icons ==========

  const PlusIcon = (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const EditIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );

  const DeleteIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );

  const FolderIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );

  const OpenIcon = (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );

  // ========== Render ==========

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-tiffany-900 tracking-tight">
            Projects
          </h2>
          <p className="text-sm text-tiffany-600/70 mt-0.5">
            Manage your media projects
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-tiffany-300 hover:bg-tiffany-400 active:bg-tiffany-500 text-white text-sm font-medium rounded-xl transition-all duration-150 shadow-sm hover:shadow-md"
        >
          {PlusIcon}
          New Project
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Create / Edit Form */}
      {showCreate && (
        <div className="mb-5 p-5 bg-white border border-tiffany-200 rounded-2xl shadow-card">
          <h3 className="text-sm font-semibold text-tiffany-900 mb-3">
            {editingId ? "Edit Project" : "New Project"}
          </h3>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="Project name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                editingId ? handleUpdate() : handleCreate();
              if (e.key === "Escape") resetForm();
            }}
            className="w-full mb-3 px-4 py-2.5 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                editingId ? handleUpdate() : handleCreate();
              if (e.key === "Escape") resetForm();
            }}
            className="w-full mb-4 px-4 py-2.5 bg-tiffany-50 border border-tiffany-200 rounded-xl text-tiffany-900 text-sm placeholder-tiffany-600/40 focus:outline-none focus:border-tiffany-300 focus:ring-2 focus:ring-tiffany-300/30 transition-all"
          />
          <div className="flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              className="px-5 py-2 bg-tiffany-300 hover:bg-tiffany-400 active:bg-tiffany-500 text-white text-sm font-medium rounded-xl transition-all duration-150"
            >
              {editingId ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="px-5 py-2 bg-tiffany-100 hover:bg-tiffany-200 text-tiffany-700 text-sm font-medium rounded-xl transition-all duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-tiffany-600/50 text-sm">
          Loading...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
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
          <p className="text-sm font-medium text-tiffany-800">
            No projects yet
          </p>
          <p className="text-xs text-tiffany-600/60 mt-1">
            Create your first project to get started
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3.5 bg-white border border-tiffany-100 hover:border-tiffany-200 hover:shadow-card-hover rounded-xl transition-all duration-150 group"
            >
              {/* Project info */}
              <button
                onClick={() => openProject(p.id)}
                className="flex-1 flex items-center gap-3 text-left min-w-0"
              >
                <div className="shrink-0 w-9 h-9 bg-tiffany-100 border border-tiffany-200 rounded-xl flex items-center justify-center">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#81d8d0"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-tiffany-900 truncate">
                    {p.name}
                  </p>
                  {p.description ? (
                    <p className="text-xs text-tiffany-600/60 truncate mt-0.5">
                      {p.description}
                    </p>
                  ) : (
                    <p className="text-xs text-tiffany-400/60 italic mt-0.5">
                      No description
                    </p>
                  )}
                </div>
              </button>

              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button
                  onClick={() => startEdit(p)}
                  className="p-2 text-tiffany-600/40 hover:text-tiffany-500 hover:bg-tiffany-50 rounded-lg transition-colors"
                  title="Edit"
                >
                  {EditIcon}
                </button>
                <button
                  onClick={() => openInFinder(p.id)}
                  className="p-2 text-tiffany-600/40 hover:text-tiffany-500 hover:bg-tiffany-50 rounded-lg transition-colors"
                  title="Open in Finder"
                >
                  {FolderIcon}
                </button>
                <button
                  onClick={() => setDeleteConfirm(p.id)}
                  className="p-2 text-tiffany-600/40 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  {DeleteIcon}
                </button>
                <button
                  onClick={() => openProject(p.id)}
                  className="p-2 text-tiffany-600/40 hover:text-tiffany-500 hover:bg-tiffany-50 rounded-lg transition-colors"
                  title="Open"
                >
                  {OpenIcon}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tiffany-900/30 backdrop-blur-sm">
          <div className="bg-white border border-tiffany-200 rounded-2xl p-6 w-80 shadow-modal">
            <h3 className="text-sm font-semibold text-tiffany-900 mb-2">
              Delete Project
            </h3>
            <p className="text-sm text-tiffany-600/80 mb-5 leading-relaxed">
              Are you sure you want to delete this project? This action cannot
              be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-tiffany-100 hover:bg-tiffany-200 text-tiffany-700 text-sm font-medium rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors"
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
