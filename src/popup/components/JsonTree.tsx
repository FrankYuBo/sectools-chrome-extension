import React, { useState, useCallback } from 'react';

interface Props {
  data: unknown;
  /** 默认展开到第几层（从 0 开始），默认 2 层 */
  expandDepth?: number;
}

const INDENT = 14;

function isExpandable(v: unknown): boolean {
  return v !== null && typeof v === 'object';
}

/** 收集所有可展开节点的路径 */
function collectPaths(value: unknown, prefix: string, out: string[]): void {
  if (!isExpandable(value)) return;
  out.push(prefix);
  if (Array.isArray(value)) {
    (value as unknown[]).forEach((item, i) => {
      if (isExpandable(item)) collectPaths(item, `${prefix}.${i}`, out);
    });
  } else {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (isExpandable(v)) collectPaths(v, `${prefix}.${k}`, out);
    });
  }
}

const Leaf: React.FC<{ value: unknown }> = ({ value }) => {
  if (value === null) return <span className="text-purple-600 dark:text-purple-400">null</span>;
  const t = typeof value;
  if (t === 'string') return <span className="text-emerald-600 dark:text-emerald-400">"{String(value)}"</span>;
  if (t === 'number') return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  if (t === 'boolean') return <span className="text-purple-600 dark:text-purple-400">{String(value)}</span>;
  if (t === 'undefined') return <span className="text-purple-600 dark:text-purple-400">undefined</span>;
  return <span>{String(value)}</span>;
};

interface NodeProps {
  keyName: string | null;
  value: unknown;
  depth: number;
  path: string;
  isLast: boolean;
  collapsed: Set<string>;
  toggle: (p: string) => void;
}

const JsonNode: React.FC<NodeProps> = ({ keyName, value, depth, path, isLast, collapsed, toggle }) => {
  const expandable = isExpandable(value);
  const isCollapsed = collapsed.has(path);
  const bracket = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  const entries: [string | null, unknown][] = expandable
    ? Array.isArray(value)
      ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(value as Record<string, unknown>)
    : [];

  return (
    <div className="leading-5">
      <div
        className="flex items-start gap-1"
        style={{ paddingLeft: depth * INDENT }}
      >
        {expandable ? (
          <button
            onClick={() => toggle(path)}
            className="mt-[2px] text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-transform shrink-0"
            title={isCollapsed ? '展开' : '折叠'}
          >
            <span className={isCollapsed ? '' : 'inline-block rotate-90'}>▶</span>
          </button>
        ) : (
          <span className="inline-block w-[10px] shrink-0" />
        )}

        <div className="whitespace-pre-wrap break-all">
          {keyName !== null && <span className="text-sky-600 dark:text-sky-400">"{keyName}"</span>}
          {keyName !== null && <span className="text-slate-500">: </span>}
          {expandable ? (
            <>
              <span className="text-slate-500">{bracket[0]}</span>
              {isCollapsed && (
                <span className="text-slate-400 dark:text-slate-500">
                  {' '}
                  {entries.length} {Array.isArray(value) ? '项' : '键'}{' '}
                  <span className="text-slate-500">{bracket[1]}{!isLast ? ',' : ''}</span>
                </span>
              )}
            </>
          ) : (
            <>
              <Leaf value={value} />
              {!isLast && <span className="text-slate-500">,</span>}
            </>
          )}
        </div>
      </div>

      {expandable && !isCollapsed && (
        <>
          {entries.map(([k, v], idx) => (
            <JsonNode
              key={k}
              keyName={Array.isArray(value) ? null : k}
              value={v}
              depth={depth + 1}
              path={`${path}.${k}`}
              isLast={idx === entries.length - 1}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
          <div className="flex items-center gap-1" style={{ paddingLeft: (depth + 1) * INDENT }}>
            <span className="inline-block w-[10px] shrink-0" />
            <span className="text-slate-500">{bracket[1]}{!isLast ? ',' : ''}</span>
          </div>
        </>
      )}
    </div>
  );
};

const JsonTree: React.FC<Props> = ({ data, expandDepth = 2 }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const all: string[] = [];
    collectPaths(data, 'root', all);
    const s = new Set<string>();
    // 默认折叠超过 expandDepth 层的节点
    all.forEach((p) => {
      const depth = p.split('.').length - 1; // root = 0
      if (depth > expandDepth) s.add(p);
    });
    return s;
  });

  const toggle = useCallback((p: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => setCollapsed(new Set()), []);
  const collapseAll = useCallback(() => {
    const all: string[] = [];
    collectPaths(data, 'root', all);
    setCollapsed(new Set(all));
  }, [data]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-1 pb-1.5 shrink-0">
        <button
          onClick={expandAll}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          展开全部
        </button>
        <button
          onClick={collapseAll}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          折叠全部
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 font-mono text-slate-700 dark:text-slate-300">
        <JsonNode
          keyName={null}
          value={data}
          depth={0}
          path="root"
          isLast
          collapsed={collapsed}
          toggle={toggle}
        />
      </div>
    </div>
  );
};

export default JsonTree;
