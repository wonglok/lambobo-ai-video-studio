interface Props {
  projectId: string;
}

export default function SceneVisualTab(_props: Props) {
  // ========== SVG Icons ==========

  const SceneIcon = (
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-tiffany-500">{SceneIcon}</span>
        <h2 className="text-base font-semibold text-tiffany-900">
          Scene Visual
        </h2>
      </div>

      <p className="text-sm text-tiffany-700">hello world</p>
    </div>
  );
}
