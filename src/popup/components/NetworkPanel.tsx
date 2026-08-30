import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { AppSettings } from '../../types';
import {
  cidrInfo,
  cidrAggregate,
  ipInCidr,
  cidrExpand,
  type CidrInfo,
  type AggregateResult,
} from '../../utils/cidr';
import {
  cronDescribe,
  naturalToCron,
  type CronDescribeResult,
} from '../../utils/cron-describe';
import {
  XdbSearcher,
  loadXdbFromUrl,
  ip2RegionSearch,
  ip2RegionBatchSearch,
  type Ip2RegionResult,
} from '../../utils/ip2region';

interface Props {
  settings?: AppSettings;
  onAutoCopy: (text: string) => void;
}

type SubTab = 'cidr' | 'ipconvert' | 'cron' | 'ipregion' | 'whois';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'cidr', label: 'CIDR' },
  { id: 'ipconvert', label: 'IP转换' },
  { id: 'cron', label: 'Cron' },
  { id: 'ipregion', label: 'IP归属' },
  { id: 'whois', label: 'Whois' },
];

const DEFAULT_XDB_URL = 'https://cdn.jsdelivr.net/npm/ip2region@2.3.0/data/ip2region.db';

const NetworkPanel: React.FC<Props> = ({ settings: _settings, onAutoCopy }) => {
  const [subTab, setSubTab] = useState<SubTab>('cidr');
  const [error, setError] = useState('');

  return (
    <div className="network-panel flex flex-col h-full">
      <style>{`
        .network-panel .sub-tab-btn {
          transition: all 0.15s ease;
        }
        .network-panel .sub-tab-btn:hover {
          background-color: rgb(241 245 249);
        }
        .dark .network-panel .sub-tab-btn:hover {
          background-color: rgb(30 41 59);
        }
        .network-panel .sub-tab-btn.active {
          background-color: rgb(238 242 255);
          color: rgb(79 70 229);
          font-weight: 500;
        }
        .dark .network-panel .sub-tab-btn.active {
          background-color: rgba(99, 102, 241, 0.1);
          color: rgb(129 140 248);
        }
        .network-panel .result-card {
          background-color: rgb(248 250 252);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
        }
        .dark .network-panel .result-card {
          background-color: rgba(30, 41, 59, 0.5);
        }
        .network-panel .info-row {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.375rem 0.75rem;
          background-color: rgb(248 250 252);
          border-radius: 0.25rem;
        }
        .dark .network-panel .info-row {
          background-color: rgba(30, 41, 59, 0.5);
        }
        .network-panel .info-label {
          font-size: 0.6875rem;
          color: rgb(148 163 184);
          width: 5rem;
          flex-shrink: 0;
          padding-top: 2px;
        }
        .dark .network-panel .info-label {
          color: rgb(100 116 139);
        }
        .network-panel .info-value {
          font-size: 0.75rem;
          color: rgb(51 65 85);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          word-break: break-all;
          flex: 1;
        }
        .dark .network-panel .info-value {
          color: rgb(203 213 225);
        }
        .network-panel .copy-btn {
          font-size: 0.6875rem;
          padding: 0.25rem 0.75rem;
          background-color: rgb(238 242 255);
          color: rgb(79 70 229);
          border-radius: 0.375rem;
          transition: all 0.15s ease;
        }
        .dark .network-panel .copy-btn {
          background-color: rgba(99, 102, 241, 0.1);
          color: rgb(129 140 248);
        }
        .network-panel .copy-btn:hover {
          background-color: rgb(224 231 255);
        }
        .dark .network-panel .copy-btn:hover {
          background-color: rgba(99, 102, 241, 0.2);
        }
        .network-panel .primary-btn {
          font-size: 0.6875rem;
          padding: 0.375rem 0.875rem;
          background-color: rgb(99 102 241);
          color: white;
          border-radius: 0.375rem;
          font-weight: 500;
          transition: all 0.15s ease;
        }
        .network-panel .primary-btn:hover {
          background-color: rgb(79 70 229);
        }
        .network-panel .primary-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .network-panel .tag {
          display: inline-flex;
          align-items: center;
          padding: 0.125rem 0.5rem;
          font-size: 0.625rem;
          border-radius: 9999px;
          font-weight: 500;
        }
        .network-panel .tag-green {
          background-color: rgb(220 252 231);
          color: rgb(22 163 74);
        }
        .dark .network-panel .tag-green {
          background-color: rgba(34, 197, 94, 0.15);
          color: rgb(74 222 128);
        }
        .network-panel .tag-blue {
          background-color: rgb(219 234 254);
          color: rgb(37 99 235);
        }
        .dark .network-panel .tag-blue {
          background-color: rgba(59, 130, 246, 0.15);
          color: rgb(96 165 250);
        }
        .network-panel .tag-yellow {
          background-color: rgb(254 249 195);
          color: rgb(202 138 4);
        }
        .dark .network-panel .tag-yellow {
          background-color: rgba(234, 179, 8, 0.15);
          color: rgb(250 204 21);
        }
        .network-panel .tag-red {
          background-color: rgb(254 226 226);
          color: rgb(220 38 38);
        }
        .dark .network-panel .tag-red {
          background-color: rgba(239, 68, 68, 0.15);
          color: rgb(248 113 113);
        }
        .network-panel .input-area {
          width: 100%;
          font-size: 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          background-color: rgb(248 250 252);
          padding: 0.5rem 0.75rem;
          color: rgb(51 65 85);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          outline: none;
          transition: all 0.15s ease;
        }
        .dark .network-panel .input-area {
          border-color: rgb(51 65 85);
          background-color: rgba(30, 41, 59, 0.5);
          color: rgb(203 213 225);
        }
        .network-panel .input-area:focus {
          box-shadow: 0 0 0 1px rgb(99 102 241);
          border-color: rgb(99 102 241);
        }
        .network-panel .input-area::placeholder {
          color: rgb(148 163 184);
        }
        .dark .network-panel .input-area::placeholder {
          color: rgb(100 116 139);
        }
        .network-panel .segmented {
          display: inline-flex;
          background-color: rgb(241 245 249);
          border-radius: 0.375rem;
          padding: 2px;
        }
        .dark .network-panel .segmented {
          background-color: rgb(30 41 59);
        }
        .network-panel .segmented button {
          font-size: 0.6875rem;
          padding: 0.25rem 0.625rem;
          border-radius: 0.25rem;
          color: rgb(100 116 139);
          transition: all 0.15s ease;
        }
        .dark .network-panel .segmented button {
          color: rgb(148 163 184);
        }
        .network-panel .segmented button.active {
          background-color: white;
          color: rgb(79 70 229);
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .dark .network-panel .segmented button.active {
          background-color: rgb(51 65 85);
          color: rgb(129 140 248);
        }
        .network-panel .cron-field {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.375rem 0.75rem;
          border-bottom: 1px solid rgb(241 245 249);
        }
        .dark .network-panel .cron-field {
          border-bottom-color: rgb(51 65 85);
        }
        .network-panel .cron-field:last-child {
          border-bottom: none;
        }
        .network-panel .progress-bar {
          height: 4px;
          background-color: rgb(226 232 240);
          border-radius: 9999px;
          overflow: hidden;
        }
        .dark .network-panel .progress-bar {
          background-color: rgb(51 65 85);
        }
        .network-panel .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, rgb(99 102 241), rgb(139 92 246));
          border-radius: 9999px;
          transition: width 0.2s ease;
        }
        .network-panel .table-wrap {
          border: 1px solid rgb(226 232 240);
          border-radius: 0.5rem;
          overflow: hidden;
        }
        .dark .network-panel .table-wrap {
          border-color: rgb(51 65 85);
        }
        .network-panel .table-wrap table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.6875rem;
        }
        .network-panel .table-wrap th {
          background-color: rgb(241 245 249);
          color: rgb(100 116 139);
          font-weight: 500;
          text-align: left;
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid rgb(226 232 240);
        }
        .dark .network-panel .table-wrap th {
          background-color: rgb(30 41 59);
          color: rgb(148 163 184);
          border-bottom-color: rgb(51 65 85);
        }
        .network-panel .table-wrap td {
          padding: 0.5rem 0.75rem;
          border-bottom: 1px solid rgb(241 245 249);
          color: rgb(51 65 85);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .dark .network-panel .table-wrap td {
          border-bottom-color: rgb(51 65 85);
          color: rgb(203 213 225);
        }
        .network-panel .table-wrap tr:last-child td {
          border-bottom: none;
        }
        .network-panel .json-pretty {
          font-size: 0.6875rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          line-height: 1.6;
          color: rgb(51 65 85);
          white-space: pre-wrap;
          word-break: break-all;
        }
        .dark .network-panel .json-pretty {
          color: rgb(203 213 225);
        }
      `}</style>

      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setError(''); }}
            className={`sub-tab-btn text-2xs px-2.5 py-1 rounded-md whitespace-nowrap ${
              subTab === t.id ? 'active' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mx-3 my-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {subTab === 'cidr' && <CidrTab onAutoCopy={onAutoCopy} onError={setError} />}
        {subTab === 'ipconvert' && <IpConvertTab onAutoCopy={onAutoCopy} onError={setError} />}
        {subTab === 'cron' && <CronTab onAutoCopy={onAutoCopy} onError={setError} />}
        {subTab === 'ipregion' && <IpRegionTab onAutoCopy={onAutoCopy} onError={setError} />}
        {subTab === 'whois' && <WhoisTab onAutoCopy={onAutoCopy} onError={setError} />}
      </div>
    </div>
  );
};

// ============================================================
// CIDR Tab
// ============================================================
type CidrMode = 'info' | 'aggregate' | 'check' | 'expand';

const CidrTab: React.FC<{ onAutoCopy: (t: string) => void; onError: (e: string) => void }> = ({ onAutoCopy, onError }) => {
  const [mode, setMode] = useState<CidrMode>('info');
  const [input, setInput] = useState('192.168.1.0/24');
  const [cidrInput, setCidrInput] = useState('192.168.1.0/24');
  const [ipInput, setIpInput] = useState('192.168.1.100');
  const [infoResult, setInfoResult] = useState<CidrInfo | null>(null);
  const [aggResult, setAggResult] = useState<AggregateResult | null>(null);
  const [checkResult, setCheckResult] = useState<{ inRange: boolean; cidr: string; ip: string } | null>(null);
  const [expandResult, setExpandResult] = useState<{ ips: string[]; total: number; truncated: boolean } | null>(null);
  const execRef = useRef<number>();

  const exec = useCallback(() => {
    onError('');
    setInfoResult(null);
    setAggResult(null);
    setCheckResult(null);
    setExpandResult(null);

    if (mode === 'info') {
      if (!input.trim()) return;
      const r = cidrInfo(input);
      if (r.success) setInfoResult(r.data);
      else onError(r.error ?? '');
    } else if (mode === 'aggregate') {
      if (!input.trim()) return;
      const r = cidrAggregate(input);
      if (r.success) setAggResult(r.data);
      else onError(r.error ?? '');
    } else if (mode === 'check') {
      if (!ipInput.trim() || !cidrInput.trim()) return;
      const r = ipInCidr(ipInput, cidrInput);
      if (r.success) setCheckResult(r.data);
      else onError(r.error ?? '');
    } else if (mode === 'expand') {
      if (!cidrInput.trim()) return;
      const r = cidrExpand(cidrInput, 256);
      if (r.success) setExpandResult(r.data);
      else onError(r.error ?? '');
    }
  }, [mode, input, cidrInput, ipInput, onError]);

  useEffect(() => {
    clearTimeout(execRef.current);
    execRef.current = window.setTimeout(exec, 200);
    return () => clearTimeout(execRef.current);
  }, [exec]);

  return (
    <div className="flex flex-col h-full px-3 py-2 gap-2">
      <div className="flex items-center justify-between shrink-0">
        <div className="segmented">
          {([
            { id: 'info', label: '信息' },
            { id: 'aggregate', label: '聚合' },
            { id: 'check', label: '归属检查' },
            { id: 'expand', label: '展开' },
          ] as { id: CidrMode; label: string }[]).map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? 'active' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {(mode === 'info' || mode === 'aggregate') && (
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mode === 'info' ? '输入 CIDR 或 IP，如 192.168.1.0/24' : '输入 IP/CIDR 列表，每行一个或用逗号分隔'}
          rows={mode === 'aggregate' ? 4 : 2}
          className="input-area shrink-0 resize-none"
        />
      )}

      {mode === 'check' && (
        <div className="flex flex-col gap-2 shrink-0">
          <input
            type="text"
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            placeholder="输入 IP，如 192.168.1.100"
            className="input-area"
          />
          <input
            type="text"
            value={cidrInput}
            onChange={(e) => setCidrInput(e.target.value)}
            placeholder="输入 CIDR，如 192.168.1.0/24"
            className="input-area"
          />
        </div>
      )}

      {mode === 'expand' && (
        <input
          type="text"
          value={cidrInput}
          onChange={(e) => setCidrInput(e.target.value)}
          placeholder="输入 CIDR，如 192.168.1.0/28（最多展开256个）"
          className="input-area shrink-0"
        />
      )}

      <div className="flex-1 overflow-auto space-y-2">
        {infoResult && (
          <div className="space-y-1.5">
            <InfoRow label="CIDR" value={infoResult.cidr} />
            <InfoRow label="网络地址" value={infoResult.network} />
            <InfoRow label="子网掩码" value={infoResult.netmask} />
            <InfoRow label="反掩码" value={infoResult.wildcard} />
            <InfoRow label="广播地址" value={infoResult.broadcast} />
            <InfoRow label="首可用IP" value={infoResult.firstHost} />
            <InfoRow label="末可用IP" value={infoResult.lastHost} />
            <InfoRow label="总IP数" value={String(infoResult.totalHosts)} />
            <InfoRow label="可用主机" value={String(infoResult.usableHosts)} />
            <InfoRow label="IP类别" value={infoResult.ipClass} />
            <div className="flex items-center gap-2 px-3 py-1.5">
              <span className="info-label" style={{ width: 'auto' }}>类型：</span>
              <span className={`tag ${infoResult.isPrivate ? 'tag-green' : 'tag-blue'}`}>
                {infoResult.isPrivate ? '内网IP' : '公网IP'}
              </span>
            </div>
            <button
              className="copy-btn self-start ml-3"
              onClick={() => { navigator.clipboard.writeText(infoResult.cidr); onAutoCopy(infoResult.cidr); }}
            >
              复制 CIDR
            </button>
          </div>
        )}

        {aggResult && (
          <div>
            <div className="result-card mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">聚合结果</span>
                <span className="tag tag-blue">{aggResult.summary}</span>
              </div>
            </div>
            <textarea
              readOnly
              value={aggResult.cidrs.join('\n')}
              rows={Math.min(aggResult.cidrs.length, 10)}
              className="input-area resize-none"
            />
            <button
              className="copy-btn mt-2"
              onClick={() => {
                const text = aggResult.cidrs.join('\n');
                navigator.clipboard.writeText(text);
                onAutoCopy(text);
              }}
            >
              复制全部
            </button>
          </div>
        )}

        {checkResult && (
          <div className="result-card">
            <div className="flex items-center gap-3">
              <span className={`tag ${checkResult.inRange ? 'tag-green' : 'tag-red'}`}>
                {checkResult.inRange ? '✓ 在范围内' : '✗ 不在范围内'}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                {checkResult.ip} ∈ {checkResult.cidr}
              </span>
            </div>
          </div>
        )}

        {expandResult && (
          <div>
            <div className="result-card mb-2 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                共 {expandResult.total} 个IP
                {expandResult.truncated && <span className="tag tag-yellow ml-2">已截断，仅显示前256个</span>}
              </span>
              <button
                className="copy-btn"
                onClick={() => {
                  const text = expandResult.ips.join('\n');
                  navigator.clipboard.writeText(text);
                  onAutoCopy(text);
                }}
              >
                复制全部
              </button>
            </div>
            <textarea
              readOnly
              value={expandResult.ips.join('\n')}
              rows={Math.min(expandResult.ips.length, 12)}
              className="input-area resize-none w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// IP 转换 Tab
// ============================================================
const IpConvertTab: React.FC<{ onAutoCopy: (t: string) => void; onError: (e: string) => void }> = ({ onAutoCopy, onError }) => {
  const [direction, setDirection] = useState<'ip2uint' | 'uint2ip'>('ip2uint');
  const [ipInput, setIpInput] = useState('192.168.1.1');
  const [uintInput, setUintInput] = useState('3232235777');
  const [hexInput, setHexInput] = useState('0xC0A80101');
  const [binInput, setBinInput] = useState('');
  const resultRef = useRef<{ ip: string; uint: number; hex: string; bin: string } | null>(null);
  const execRef = useRef<number>();

  const ipToUint = (ip: string): number => {
    const parts = ip.trim().split('.');
    if (parts.length !== 4) throw new Error('INVALID_IP');
    let result = 0;
    for (const p of parts) {
      const n = parseInt(p, 10);
      if (isNaN(n) || n < 0 || n > 255) throw new Error('INVALID_IP');
      result = (result << 8) | n;
    }
    return result >>> 0;
  };

  const uintToIp = (n: number): string => {
    return [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    ].join('.');
  };

  const exec = useCallback(() => {
    onError('');
    try {
      if (direction === 'ip2uint') {
        if (!ipInput.trim()) { resultRef.current = null; return; }
        const uint = ipToUint(ipInput);
        resultRef.current = {
          ip: uintToIp(uint),
          uint,
          hex: '0x' + uint.toString(16).toUpperCase().padStart(8, '0'),
          bin: uint.toString(2).padStart(32, '0'),
        };
        setUintInput(String(uint));
        setHexInput('0x' + uint.toString(16).toUpperCase().padStart(8, '0'));
        setBinInput(uint.toString(2).padStart(32, '0'));
      } else {
        let n = 0;
        if (uintInput.trim()) {
          const parsed = parseInt(uintInput.trim(), 10);
          if (!isNaN(parsed)) n = parsed >>> 0;
        } else if (hexInput.trim()) {
          const hex = hexInput.trim().replace(/^0x/i, '');
          const parsed = parseInt(hex, 16);
          if (!isNaN(parsed)) n = parsed >>> 0;
        } else if (binInput.trim()) {
          const parsed = parseInt(binInput.trim(), 2);
          if (!isNaN(parsed)) n = parsed >>> 0;
        } else {
          resultRef.current = null;
          return;
        }
        if (n > 0xffffffff) throw new Error('INVALID_UINT');
        resultRef.current = {
          ip: uintToIp(n),
          uint: n,
          hex: '0x' + n.toString(16).toUpperCase().padStart(8, '0'),
          bin: n.toString(2).padStart(32, '0'),
        };
        setIpInput(uintToIp(n));
      }
    } catch (e) {
      resultRef.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'INVALID_IP') onError('无效的 IPv4 地址');
      else if (msg === 'INVALID_UINT') onError('数值超出 IPv4 范围 (0-4294967295)');
      else onError('转换失败: ' + msg);
    }
  }, [direction, ipInput, uintInput, hexInput, binInput, onError]);

  useEffect(() => {
    clearTimeout(execRef.current);
    execRef.current = window.setTimeout(exec, 200);
    return () => clearTimeout(execRef.current);
  }, [exec]);

  const r = resultRef.current;

  return (
    <div className="flex flex-col h-full px-3 py-2 gap-2">
      <div className="flex items-center justify-between shrink-0">
        <div className="segmented">
          <button
            className={direction === 'ip2uint' ? 'active' : ''}
            onClick={() => setDirection('ip2uint')}
          >
            IP → 数值
          </button>
          <button
            className={direction === 'uint2ip' ? 'active' : ''}
            onClick={() => setDirection('uint2ip')}
          >
            数值 → IP
          </button>
        </div>
      </div>

      {direction === 'ip2uint' ? (
        <input
          type="text"
          value={ipInput}
          onChange={(e) => setIpInput(e.target.value)}
          placeholder="输入 IPv4 地址，如 192.168.1.1"
          className="input-area shrink-0"
        />
      ) : (
        <div className="flex flex-col gap-2 shrink-0">
          <input
            type="text"
            value={uintInput}
            onChange={(e) => { setUintInput(e.target.value); setHexInput(''); setBinInput(''); }}
            placeholder="十进制，如 3232235777"
            className="input-area"
          />
          <input
            type="text"
            value={hexInput}
            onChange={(e) => { setHexInput(e.target.value); setUintInput(''); setBinInput(''); }}
            placeholder="十六进制，如 0xC0A80101"
            className="input-area"
          />
          <input
            type="text"
            value={binInput}
            onChange={(e) => { setBinInput(e.target.value); setUintInput(''); setHexInput(''); }}
            placeholder="二进制，如 11000000101010000000000100000001"
            className="input-area"
          />
        </div>
      )}

      <div className="flex-1 overflow-auto space-y-1.5">
        {r && (
          <>
            <div className="flex items-center justify-between info-row">
              <span className="info-label">IPv4</span>
              <span className="info-value">{r.ip}</span>
              <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(r.ip); onAutoCopy(r.ip); }}>复制</button>
            </div>
            <div className="flex items-center justify-between info-row">
              <span className="info-label">十进制</span>
              <span className="info-value">{String(r.uint)}</span>
              <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(String(r.uint)); onAutoCopy(String(r.uint)); }}>复制</button>
            </div>
            <div className="flex items-center justify-between info-row">
              <span className="info-label">十六进制</span>
              <span className="info-value">{r.hex}</span>
              <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(r.hex); onAutoCopy(r.hex); }}>复制</button>
            </div>
            <div className="info-row">
              <span className="info-label">二进制</span>
              <div className="flex-1">
                <span className="info-value" style={{ letterSpacing: '1px' }}>
                  {r.bin.slice(0, 8)}.{r.bin.slice(8, 16)}.{r.bin.slice(16, 24)}.{r.bin.slice(24, 32)}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ============================================================
// Cron Tab
// ============================================================
type CronMode = 'describe' | 'natural';

const CronTab: React.FC<{ onAutoCopy: (t: string) => void; onError: (e: string) => void }> = ({ onAutoCopy, onError }) => {
  const [mode, setMode] = useState<CronMode>('describe');
  const [cronInput, setCronInput] = useState('0 0 2 * * ?');
  const [naturalInput, setNaturalInput] = useState('每天早上8点');
  const [describeResult, setDescribeResult] = useState<CronDescribeResult | null>(null);
  const [naturalResult, setNaturalResult] = useState<{ cron: string; matched: string; description: string }[] | null>(null);
  const execRef = useRef<number>();

  const exec = useCallback(() => {
    onError('');
    setDescribeResult(null);
    setNaturalResult(null);

    if (mode === 'describe') {
      if (!cronInput.trim()) return;
      const r = cronDescribe(cronInput);
      if (r.success) setDescribeResult(r.data);
      else onError(r.error ?? '');
    } else {
      if (!naturalInput.trim()) return;
      const r = naturalToCron(naturalInput);
      if (r.success) setNaturalResult(r.data);
      else onError(r.error ?? '');
    }
  }, [mode, cronInput, naturalInput, onError]);

  useEffect(() => {
    clearTimeout(execRef.current);
    execRef.current = window.setTimeout(exec, 250);
    return () => clearTimeout(execRef.current);
  }, [exec]);

  return (
    <div className="flex flex-col h-full px-3 py-2 gap-2">
      <div className="flex items-center justify-between shrink-0">
        <div className="segmented">
          <button
            className={mode === 'describe' ? 'active' : ''}
            onClick={() => setMode('describe')}
          >
            表达式解读
          </button>
          <button
            className={mode === 'natural' ? 'active' : ''}
            onClick={() => setMode('natural')}
          >
            语义生成
          </button>
        </div>
      </div>

      {mode === 'describe' ? (
        <input
          type="text"
          value={cronInput}
          onChange={(e) => setCronInput(e.target.value)}
          placeholder="输入 Cron 表达式，如 0 0 2 * * ? 或 0 30 9 ? * MON-FRI"
          className="input-area shrink-0"
        />
      ) : (
        <input
          type="text"
          value={naturalInput}
          onChange={(e) => setNaturalInput(e.target.value)}
          placeholder="输入自然语言，如 每天早上8点、每周一、每月1号"
          className="input-area shrink-0"
        />
      )}

      <div className="flex-1 overflow-auto space-y-2">
        {describeResult && (
          <div className="space-y-2">
            <div className="result-card">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-0.5">
                    {describeResult.shortDescription}
                  </div>
                  <div className="text-2xs text-slate-500 dark:text-slate-400">
                    {describeResult.description}
                  </div>
                </div>
                <button
                  className="copy-btn"
                  onClick={() => { navigator.clipboard.writeText(describeResult.expression); onAutoCopy(describeResult.expression); }}
                >
                  复制
                </button>
              </div>
            </div>

            <div className="result-card">
              <div className="text-2xs text-slate-500 dark:text-slate-400 mb-1">字段解析</div>
              <div className="-mx-3 -my-1">
                {describeResult.fields.map((f) => (
                  <div key={f.name} className="cron-field">
                    <div className="flex items-center gap-2">
                      <span className="tag tag-blue">{f.name}</span>
                      <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{f.raw}</span>
                    </div>
                    <span className="text-2xs text-slate-500 dark:text-slate-400">{f.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="result-card">
              <div className="text-2xs text-slate-500 dark:text-slate-400 mb-2">接下来 5 次执行</div>
              <div className="space-y-1">
                {describeResult.nextRuns.map((t, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-slate-600 dark:text-slate-400">#{i + 1}</span>
                    <span className="text-xs font-mono text-primary-600 dark:text-primary-400">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {naturalResult && (
          <div className="space-y-2">
            {naturalResult.map((r, i) => (
              <div key={i} className="result-card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="tag tag-green">{r.matched}</span>
                    </div>
                    <div className="text-sm font-mono text-primary-600 dark:text-primary-400 mb-1">
                      {r.cron}
                    </div>
                    <div className="text-2xs text-slate-500 dark:text-slate-400">
                      {r.description}
                    </div>
                  </div>
                  <button
                    className="copy-btn"
                    onClick={() => { navigator.clipboard.writeText(r.cron); onAutoCopy(r.cron); }}
                  >
                    复制
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// IP 归属 Tab
// ============================================================
type IpRegionMode = 'single' | 'batch';

const IpRegionTab: React.FC<{ onAutoCopy: (t: string) => void; onError: (e: string) => void }> = ({ onAutoCopy, onError }) => {
  const [mode, setMode] = useState<IpRegionMode>('single');
  const [xdbUrl, setXdbUrl] = useState(DEFAULT_XDB_URL);
  const [searcher, setSearcher] = useState<XdbSearcher | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [singleIp, setSingleIp] = useState('8.8.8.8');
  const [batchInput, setBatchInput] = useState('8.8.8.8\n1.1.1.1\n114.114.114.114');
  const [singleResult, setSingleResult] = useState<Ip2RegionResult | null>(null);
  // UI 展示用的批量结果视图（兼容 ip2RegionBatchSearch）
  interface BatchItem { ip: string; region: string; city: string; isp: string; error?: string }
  interface BatchResultView { success: number; failed: number; total: number; results: BatchItem[] }
  const [batchResult, setBatchResult] = useState<BatchResultView | null>(null);
  const execRef = useRef<number>();

  // 挂载时自动加载扩展内置的 ip2region.db，失败再 fallback
  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const localUrl = chrome.runtime.getURL('/data/ip2region.db');
        const s = await loadXdbFromUrl(localUrl);
        if (canceled) return;
        setXdbUrl(localUrl);
        setSearcher(s);
      } catch {
        // 静默忽略，让用户手动加载或使用 CDN 默认
      }
    })();
    return () => { canceled = true; };
  }, []);

  const loadXdb = useCallback(async () => {
    if (!xdbUrl.trim()) { onError('请输入 ip2region db 文件 URL'); return; }
    setLoading(true);
    setProgress(null);
    setSearcher(null);
    onError('');
    try {
      const s = await loadXdbFromUrl(xdbUrl.trim(), (loaded, total) => {
        setProgress({ loaded, total });
      });
      setSearcher(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onError('加载 ip2region db 失败: ' + msg);
    } finally {
      setLoading(false);
    }
  }, [xdbUrl, onError]);

  const exec = useCallback(() => {
    onError('');
    setSingleResult(null);
    setBatchResult(null);
    if (!searcher) return;

    if (mode === 'single') {
      if (!singleIp.trim()) return;
      const r = ip2RegionSearch(searcher, singleIp);
      if (r.success) setSingleResult(r.data);
      else onError(r.error ?? '');
    } else {
      if (!batchInput.trim()) return;
      const r = ip2RegionBatchSearch(searcher, batchInput);
      if (r.success) {
        const results: BatchItem[] = r.data.map((x) => ({
          ip: x.ip,
          region: x.result ? [x.result.country, x.result.region, x.result.province].filter(Boolean).join(' ') : '',
          city: x.result?.city ?? '',
          isp: x.result?.isp ?? '',
          error: x.error,
        }));
        const successCount = results.filter((x) => !x.error).length;
        setBatchResult({
          success: successCount,
          failed: results.length - successCount,
          total: results.length,
          results,
        });
      } else onError(r.error ?? '');
    }
  }, [mode, singleIp, batchInput, searcher, onError]);

  useEffect(() => {
    clearTimeout(execRef.current);
    execRef.current = window.setTimeout(exec, 200);
    return () => clearTimeout(execRef.current);
  }, [exec]);

  const progressPct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
    : loading ? 5 : 100;

  return (
    <div className="flex flex-col h-full px-3 py-2 gap-2">
      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={xdbUrl}
            onChange={(e) => setXdbUrl(e.target.value)}
            placeholder="ip2region db 文件 URL"
            className="input-area flex-1"
          />
          <button
            className="primary-btn"
            onClick={loadXdb}
            disabled={loading}
          >
            {loading ? '加载中...' : searcher ? '重新加载' : '加载库'}
          </button>
        </div>

        {(loading || progress) && (
          <div className="space-y-1">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="text-2xs text-slate-400">
              {loading ? '加载 xdb 数据库中...' : progress && progress.total > 0
                ? `${(progress.loaded / 1024 / 1024).toFixed(2)} MB / ${(progress.total / 1024 / 1024).toFixed(2)} MB (${progressPct}%)`
                : '已就绪'}
            </div>
          </div>
        )}

        {searcher && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="tag tag-green">xdb 已加载</span>
              <div className="segmented">
                <button
                  className={mode === 'single' ? 'active' : ''}
                  onClick={() => setMode('single')}
                >
                  单查
                </button>
                <button
                  className={mode === 'batch' ? 'active' : ''}
                  onClick={() => setMode('batch')}
                >
                  批量
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {searcher && (
        <>
          {mode === 'single' ? (
            <input
              type="text"
              value={singleIp}
              onChange={(e) => setSingleIp(e.target.value)}
              placeholder="输入 IP，如 8.8.8.8"
              className="input-area shrink-0"
            />
          ) : (
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder="批量输入 IP，每行一个或用逗号分隔"
              rows={3}
              className="input-area shrink-0 resize-none"
            />
          )}

          <div className="flex-1 overflow-auto space-y-2">
            {singleResult && (
              <div className="space-y-1.5">
                <InfoRow label="IP地址" value={singleResult.ip} />
                <InfoRow label="国家" value={singleResult.country || '未知'} />
                <InfoRow label="省份" value={singleResult.province || '未知'} />
                <InfoRow label="城市" value={singleResult.city || '未知'} />
                <InfoRow label="运营商" value={singleResult.isp || '未知'} />
                <InfoRow label="原始数据" value={singleResult.raw} />
                <InfoRow label="数值" value={String(singleResult.ipUint)} />
                <button
                  className="copy-btn self-start ml-3"
                  onClick={() => {
                    const text = `${singleResult.ip}\t${[singleResult.country, singleResult.province, singleResult.city, singleResult.isp].filter(Boolean).join('|')}`;
                    navigator.clipboard.writeText(text);
                    onAutoCopy(text);
                  }}
                >
                  复制归属信息
                </button>
              </div>
            )}

            {batchResult && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="tag tag-green">成功 {batchResult.success}</span>
                    {batchResult.failed > 0 && <span className="tag tag-red">失败 {batchResult.failed}</span>}
                    <span className="text-2xs text-slate-400">共 {batchResult.total} 条</span>
                  </div>
                  <button
                    className="copy-btn"
                    onClick={() => {
                      const text = batchResult.results
                        .map((r) => `${r.ip}\t${r.region}\t${r.city}\t${r.isp}`)
                        .join('\n');
                      navigator.clipboard.writeText(text);
                      onAutoCopy(text);
                    }}
                  >
                    复制全部
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>IP</th>
                        <th>地区</th>
                        <th>城市</th>
                        <th>运营商</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchResult.results.map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: r.error ? 'rgb(248 113 113)' : undefined }}>{r.ip}</td>
                          <td>{r.region}</td>
                          <td>{r.city}</td>
                          <td>{r.isp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!searcher && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-xs text-slate-400 dark:text-slate-500">
              <div className="mb-2">📡 请先加载 ip2region 数据库</div>
              <div className="text-2xs">推荐使用 jsDelivr CDN 的官方 db 文件，或直接使用扩展内置数据</div>
            </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Whois (RDAP) Tab
// ============================================================
type WhoisResultType = 'ip' | 'domain' | 'asn' | 'unknown';

const WhoisTab: React.FC<{ onAutoCopy: (t: string) => void; onError: (e: string) => void }> = ({ onAutoCopy, onError }) => {
  const [target, setTarget] = useState('8.8.8.8');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: WhoisResultType;
    target: string;
    data: unknown;
    source: string;
  } | null>(null);

  const doQuery = useCallback(async () => {
    if (!target.trim()) { onError('请输入查询目标'); return; }
    setLoading(true);
    setResult(null);
    onError('');
    try {
      const resp: { ok: boolean; data?: unknown; error?: string } = await new Promise((resolve, reject) => {
        const sent = chrome.runtime.sendMessage(
          { type: 'sec:rdap-query', target: target.trim() },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response as { ok: boolean; data?: unknown; error?: string });
            }
          },
        );
        if ((sent as unknown as boolean) === false) {
          reject(new Error('消息发送失败'));
        }
      });

      if (resp.ok && resp.data) {
        setResult(resp.data as { type: WhoisResultType; target: string; data: unknown; source: string });
      } else {
        onError(resp.error ?? '查询失败');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onError('RDAP 查询失败: ' + msg);
    } finally {
      setLoading(false);
    }
  }, [target, onError]);

  const formatJson = (obj: unknown): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  const extractSummary = (data: unknown): { label: string; value: string }[] => {
    const result: { label: string; value: string }[] = [];
    if (!data || typeof data !== 'object') return result;
    const d = data as Record<string, unknown>;

    if (d.handle) result.push({ label: 'Handle', value: String(d.handle) });
    if (d.name) result.push({ label: '名称', value: String(d.name) });
    if (d.type) result.push({ label: '类型', value: String(d.type) });
    if (d.country) result.push({ label: '国家', value: String(d.country) });

    if (d.startAddress && d.endAddress) {
      result.push({ label: 'IP范围', value: `${d.startAddress} - ${d.endAddress}` });
    }
    if (d.ipVersion) result.push({ label: 'IP版本', value: String(d.ipVersion) });
    if (Array.isArray(d.cidr0_cidrs)) {
      const cidrs = (d.cidr0_cidrs as Array<{ v4prefix?: string; prefix_length?: number; v6prefix?: string }>)
        .map((c) => c.v4prefix ? `${c.v4prefix}/${c.prefix_length}` : `${c.v6prefix}/${c.prefix_length}`)
        .join(', ');
      if (cidrs) result.push({ label: 'CIDR', value: cidrs });
    }

    if (d.ldhName) result.push({ label: '域名', value: String(d.ldhName) });
    if (Array.isArray(d.nameservers)) {
      const ns = (d.nameservers as Array<{ ldhName?: string }>).map((n) => n.ldhName).filter(Boolean).join(', ');
      if (ns) result.push({ label: 'DNS', value: ns });
    }
    if (Array.isArray(d.status)) {
      result.push({ label: '状态', value: (d.status as string[]).join(', ') });
    }

    if (Array.isArray(d.entities)) {
      for (const ent of (d.entities as Array<{ roles?: string[]; vcardArray?: unknown[]; handle?: string }>)) {
        if (ent.roles && ent.roles.length > 0) {
          let name = '';
          if (Array.isArray(ent.vcardArray) && ent.vcardArray.length > 1) {
            const vcard = ent.vcardArray[1] as Array<[string, unknown, string, unknown]>;
            const fn = vcard?.find((x) => x[0] === 'fn');
            if (fn) name = String(fn[3] ?? '');
          }
          result.push({
            label: ent.roles[0],
            value: name || ent.handle || '-',
          });
        }
      }
    }

    if (Array.isArray(d.events)) {
      for (const ev of (d.events as Array<{ eventAction?: string; eventDate?: string }>)) {
        if (ev.eventAction && ev.eventDate) {
          const labelMap: Record<string, string> = {
            registration: '注册时间',
            expiration: '过期时间',
            lastChanged: '更新时间',
            lastUpdate: '更新时间',
          };
          result.push({
            label: labelMap[ev.eventAction] || ev.eventAction,
            value: ev.eventDate,
          });
        }
      }
    }

    return result;
  };

  const summary = result ? extractSummary(result.data) : [];

  return (
    <div className="flex flex-col h-full px-3 py-2 gap-2">
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doQuery(); }}
          placeholder="输入 IP / 域名 / ASN，如 8.8.8.8、example.com、AS15169"
          className="input-area flex-1"
        />
        <button
          className="primary-btn"
          onClick={doQuery}
          disabled={loading}
        >
          {loading ? '查询中...' : 'RDAP 查询'}
        </button>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {result && (
          <>
            <div className="result-card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`tag ${
                    result.type === 'ip' ? 'tag-blue' :
                    result.type === 'domain' ? 'tag-green' :
                    result.type === 'asn' ? 'tag-yellow' : 'tag-red'
                  }`}>
                    {result.type === 'ip' ? 'IP' : result.type === 'domain' ? '域名' : result.type === 'asn' ? 'ASN' : '未知'}
                  </span>
                  <span className="text-xs font-mono text-slate-700 dark:text-slate-300">{result.target}</span>
                </div>
                <a
                  href={result.source}
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xs text-primary-500 hover:text-primary-600 dark:text-primary-400"
                >
                  源链接 ↗
                </a>
              </div>

              {summary.length > 0 && (
                <div className="space-y-1.5">
                  {summary.map((s, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="info-label shrink-0" style={{ width: '4.5rem' }}>{s.label}</span>
                      <span className="info-value">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="result-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xs text-slate-500 dark:text-slate-400">原始 JSON</span>
                <button
                  className="copy-btn"
                  onClick={() => {
                    const text = formatJson(result.data);
                    navigator.clipboard.writeText(text);
                    onAutoCopy(text);
                  }}
                >
                  复制 JSON
                </button>
              </div>
              <div className="json-pretty max-h-60 overflow-auto">
                {formatJson(result.data)}
              </div>
            </div>
          </>
        )}

        {!result && !loading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-xs text-slate-400 dark:text-slate-500 space-y-2">
              <div>🔍 支持 IP / 域名 / ASN 查询</div>
              <div className="text-2xl">
                示例：<span className="tag tag-blue mx-1">8.8.8.8</span>
                <span className="tag tag-green mx-1">example.com</span>
                <span className="tag tag-yellow mx-1">AS15169</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// 公共组件
// ============================================================
const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="info-row">
    <span className="info-label">{label}</span>
    <span className="info-value">{value}</span>
  </div>
);

export default NetworkPanel;
