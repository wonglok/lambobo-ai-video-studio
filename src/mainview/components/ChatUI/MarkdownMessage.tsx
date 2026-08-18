import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
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
    <pre className="my-2 overflow-x-auto rounded-lg bg-tiffany-900/95 p-3 text-xs leading-relaxed text-tiffany-50">
      {children}
    </pre>
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
