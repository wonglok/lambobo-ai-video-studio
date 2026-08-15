import { useEffect, useRef } from "react";

export interface SheetItem {
  id: string;
  name: string;
  url: string;
}

interface Props {
  items: SheetItem[];
}

const CELL_W = 160;
const CELL_H = 160;
const LABEL_H = 18;
const GAP = 12;
const PADDING = 12;
const COLUMNS = 5;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

/** Draw a contain-fit image into a cell, centered. */
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
) {
  const scale = Math.min(CELL_W / img.width, CELL_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (CELL_W - dw) / 2, y + (CELL_H - dh) / 2, dw, dh);
}

export default function CharacterSheet({ items }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = Math.max(1, COLUMNS);
    const rows = Math.ceil(items.length / cols) || 1;
    const width = cols * CELL_W + (cols - 1) * GAP + PADDING * 2;
    const height = rows * (CELL_H + LABEL_H) + (rows - 1) * GAP + PADDING * 2;

    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (items.length === 0) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No characters yet", width / 2, height / 2);
      return;
    }

    // Guard against stale async draws if `items` changes mid-load.
    let cancelled = false;

    items.forEach(async (item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PADDING + col * (CELL_W + GAP);
      const y = PADDING + row * (CELL_H + LABEL_H + GAP);

      // Cell background
      ctx.fillStyle = "#f0fdfa";
      ctx.fillRect(x, y, CELL_W, CELL_H + LABEL_H);

      let img: HTMLImageElement | null = null;
      try {
        img = await loadImage(item.url);
      } catch {
        img = null;
      }
      if (cancelled) return;

      if (img) drawContain(ctx, img, x, y);

      // Label bar
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(x, y + CELL_H, CELL_W, LABEL_H);
      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.name, x + CELL_W / 2, y + CELL_H + LABEL_H / 2);
    });

    return () => {
      cancelled = true;
    };
  }, [items]);

  const downloadSheet = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "character-sheet.png";
    a.click();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-tiffany-600/60">
          {items.length} character{items.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={downloadSheet}
          disabled={items.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-tiffany-200 bg-white text-tiffany-600 hover:border-tiffany-300 disabled:opacity-50 transition-colors"
        >
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
          Download Sheet
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="rounded-xl border border-tiffany-200 max-w-full h-auto"
      />
    </div>
  );
}
