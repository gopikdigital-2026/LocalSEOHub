import React, { useState } from 'react';
import { Copy, Check, Code2, Lightbulb } from 'lucide-react';

function tokenizeJson(json: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /("(?:[^"\\]|\\.)*")\s*(:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],])/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(json)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(<span key={key++} className="text-slate-500">{json.slice(lastIndex, match.index)}</span>);
    }
    if (match[1] !== undefined) {
      if (match[2]) {
        tokens.push(<span key={key++} className="text-sky-300">{match[1]}</span>);
        tokens.push(<span key={key++} className="text-slate-400">{match[2]}</span>);
      } else {
        tokens.push(<span key={key++} className="text-emerald-300">{match[1]}</span>);
      }
    } else if (match[3] !== undefined) {
      tokens.push(<span key={key++} className="text-amber-400">{match[3]}</span>);
    } else if (match[4] !== undefined) {
      tokens.push(<span key={key++} className="text-violet-400">{match[4]}</span>);
    } else if (match[5] !== undefined) {
      tokens.push(<span key={key++} className="text-slate-500">{match[5]}</span>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < json.length) {
    tokens.push(<span key={key++} className="text-slate-500">{json.slice(lastIndex)}</span>);
  }
  return tokens;
}

export default function SchemaCodePanel({ schema }: { schema: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `<script type="application/ld+json">\n${schema}\n</script>`
    ).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const lines = schema.split('\n');
  const tokens = tokenizeJson(schema);

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-700/60 shadow-xl shadow-black/20">
      {/* Editor chrome bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-amber-500/70" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
            <Code2 size={12} className="text-slate-500" />
            <span className="text-xs text-slate-400 font-mono">schema.json-ld</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 font-mono">application/ld+json</span>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              copied
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                : 'bg-slate-700/80 border border-slate-600/60 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-500'
            }`}
          >
            {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar Código</>}
          </button>
        </div>
      </div>

      {/* Code body */}
      <div className="bg-[#0d1117] overflow-x-auto">
        <div className="p-4 flex gap-4 min-w-0">
          <div className="shrink-0 select-none text-right">
            {lines.map((_, i) => (
              <div key={i} className="text-xs text-slate-700 font-mono leading-6">{i + 1}</div>
            ))}
          </div>
          <pre className="text-xs font-mono leading-6 text-slate-300 whitespace-pre flex-1 min-w-0">
            {tokens}
          </pre>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2.5 bg-slate-800/60 border-t border-slate-700/40 flex items-center gap-2">
        <Lightbulb size={11} className="text-amber-400 shrink-0" />
        <p className="text-xs text-slate-500">
          Pega este bloque <code className="text-slate-400 bg-slate-700/50 px-1 rounded">{'<script type="application/ld+json">'}</code> en el <code className="text-slate-400 bg-slate-700/50 px-1 rounded">{'<head>'}</code> de tu web para mejorar el SEO técnico
        </p>
      </div>
    </div>
  );
}
