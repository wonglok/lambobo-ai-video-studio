import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

/** Recursively extract plain text from rendered markdown children. */
function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}

const CopyIcon = (
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
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface CodeBlockProps {
  code: string;
  children: ReactNode;
}

function CodeBlock({ code, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group relative my-2">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-tiffany-700 bg-tiffany-800/80 px-1.5 py-1 text-[10px] font-medium text-tiffany-100 opacity-0 transition-opacity hover:bg-tiffany-700 focus:opacity-100 group-hover:opacity-100"
        title={copied ? "Copied" : "Copy code"}
      >
        {copied ? CheckIcon : CopyIcon}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="overflow-x-auto rounded-lg bg-tiffany-900/95 p-3 pr-16 text-xs leading-relaxed text-tiffany-50">
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  p: ({ children }) => (
    <p className="my-1 leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-tiffany-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-tiffany-600 underline hover:text-tiffany-700"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-1 list-disc pl-5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1 list-decimal pl-5 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-1 border-l-2 border-tiffany-300 pl-3 italic text-tiffany-600">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-tiffany-200" />,
  h1: ({ children }) => (
    <h1 className="mb-1 mt-2 text-base font-bold text-tiffany-900">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-sm font-bold text-tiffany-900">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-[13px] font-semibold text-tiffany-800">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-1.5 text-xs font-semibold text-tiffany-800">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-0.5 mt-1 text-xs font-medium text-tiffany-700">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-0.5 mt-1 text-xs font-medium text-tiffany-700">
      {children}
    </h6>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-tiffany-200">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-tiffany-50">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-tiffany-100">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="whitespace-nowrap border border-tiffany-200 px-2 py-1 text-left font-semibold text-tiffany-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-tiffany-200 px-2 py-1 align-top text-tiffany-800">
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <CodeBlock code={extractText(children)}>{children}</CodeBlock>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return <code className="font-mono">{children}</code>;
    }
    return (
      <code className="rounded bg-tiffany-100 px-1.5 py-0.5 font-mono text-[11px] text-tiffany-700">
        {children}
      </code>
    );
  },
};

export function MarkdownMessage({ content }: Props) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
