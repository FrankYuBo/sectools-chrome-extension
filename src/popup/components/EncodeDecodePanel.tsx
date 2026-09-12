import React, { useState, useCallback, useEffect } from 'react';
import { usePersistentState } from '../../utils/persistent-state';
import {
  base64Encode, base64Decode,
  base32Encode, base32Decode,
  hexEncode, hexDecode,
  urlEncode, urlDecode,
  unicodeEscapeEncode, unicodeEscapeDecode,
  htmlEntityEncode, htmlEntityDecode,
  jwtDecode, multiLayerDecode,
} from '../../utils';
import type { JwtPayload } from '../../utils';
import {
  analyzeJwtTimeFields, checkJwtSecurity, signJwtHS, forgeJwtNone,
  JWT_HEADER_FIELD_DOCS, JWT_PAYLOAD_FIELD_DOCS,
} from '../../utils/jwt-tools';
import type { JwtSecurityFinding, JwtSignAlg } from '../../utils/jwt-tools';
import type {
  ToolResult, MultiLayerDecodeResult,
} from '../../types';

interface Props {
  onAutoCopy: (text: string) => void;
}

type SubTab = 'base64' | 'base32' | 'hex' | 'url' | 'unicode' | 'html' | 'jwt' | 'multilayer';
type Direction = 'encode' | 'decode';

const SUB_TABS: { id: SubTab; label: string; hasEncode?: boolean }[] = [
  { id: 'base64', label: 'Base64', hasEncode: true },
  { id: 'base32', label: 'Base32', hasEncode: true },
  { id: 'hex', label: 'Hex', hasEncode: true },
  { id: 'url', label: 'URL', hasEncode: true },
  { id: 'unicode', label: 'Unicode', hasEncode: true },
  { id: 'html', label: 'HTML', hasEncode: true },
  { id: 'jwt', label: 'JWT' },
  { id: 'multilayer', label: '多层解码' },
];

const EncodeDecodePanel: React.FC<Props> = ({ onAutoCopy }) => {
  const [subTab, setSubTab] = usePersistentState<SubTab>('encode.subTab', 'base64');
  const [direction, setDirection] = usePersistentState<Direction>('encode.direction', 'decode');
  const [input, setInput] = usePersistentState<string>('encode.input', '');
  const [output, setOutput] = usePersistentState<string>('encode.output', '');
  const [lastLayerResult, setLastLayerResult] = usePersistentState<string>('encode.lastLayerResult', '');
  const [error, setError] = useState('');
  const [jwtResult, setJwtResult] = usePersistentState<JwtPayload | null>('encode.jwtResult', null);

  // JWT 签发/伪造工具区状态（全部持久化）
  const [forgeOpen, setForgeOpen] = usePersistentState<boolean>('encode.jwt.forgeOpen', false);
  const [forgeAlg, setForgeAlg] = usePersistentState<JwtSignAlg>('encode.jwt.forgeAlg', 'HS256');
  const [forgePayload, setForgePayload] = usePersistentState<string>('encode.jwt.forgePayload', '');
  const [forgeSecret, setForgeSecret] = usePersistentState<string>('encode.jwt.forgeSecret', '');
  const [forgeResult, setForgeResult] = usePersistentState<string>('encode.jwt.forgeResult', '');
  const [forgeError, setForgeError] = useState('');

  const currentTab = SUB_TABS.find((t) => t.id === subTab)!;
  const isDecodeOnly = !currentTab.hasEncode;

  const exec = useCallback(() => {
    if (!input.trim()) {
      setOutput('');
      setError('');
      return;
    }
    setError('');
    setOutput('');
    setJwtResult(null);
    setLastLayerResult('');

    let result: ToolResult<unknown>;

    switch (subTab) {
      case 'base64':
        result = direction === 'encode' ? base64Encode(input) : base64Decode(input);
        break;
      case 'base32':
        result = direction === 'encode' ? base32Encode(input) : base32Decode(input);
        break;
      case 'hex':
        result = direction === 'encode' ? hexEncode(input) : hexDecode(input);
        break;
      case 'url':
        result = direction === 'encode' ? urlEncode(input) : urlDecode(input);
        break;
      case 'unicode':
        result = direction === 'encode' ? unicodeEscapeEncode(input) : unicodeEscapeDecode(input);
        break;
      case 'html':
        result = direction === 'encode' ? htmlEntityEncode(input) : htmlEntityDecode(input);
        break;
      case 'jwt': {
        result = jwtDecode(input);
        if (result.success && result.data) {
          const p = result.data as JwtPayload;
          setJwtResult(p);
          setOutput(JSON.stringify(p.payload, null, 2));
        }
        break;
      }
      case 'multilayer': {
        result = multiLayerDecode(input, 10);
        if (result.success) {
          const data = result.data as MultiLayerDecodeResult;
          setOutput(data.layers.map((l) => `[${l.layer}] ${l.detected}\n${l.result}`).join('\n\n'));
          if (data.layers.length > 0) {
            setLastLayerResult(data.layers[data.layers.length - 1].result);
          }
        }
        break;
      }
      default:
        return;
    }

    if (result.success) {
      const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      if (subTab !== 'jwt' && subTab !== 'multilayer') {
        setOutput(text);
      }
    } else {
      setError(result.error ?? 'Unknown error');
    }
  }, [input, subTab, direction]);

  // 输入即运行（150ms 防抖）
  useEffect(() => {
    const timer = setTimeout(exec, 150);
    return () => clearTimeout(timer);
  }, [exec]);

  const copyOutput = () => {
    const copyText = subTab === 'multilayer' ? lastLayerResult : output;
    if (copyText) {
      navigator.clipboard.writeText(copyText);
      onAutoCopy(copyText);
    }
  };

  const copyText = (text: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      onAutoCopy(text);
    }
  };

  const fillForgePayload = () => {
    if (jwtResult) setForgePayload(JSON.stringify(jwtResult.payload, null, 2));
    setForgeOpen(true);
  };

  const doSign = async () => {
    setForgeError('');
    if (forgeAlg !== 'none' && !forgeSecret.trim()) {
      setForgeError('请填写密钥 secret（HS256/384/512 必填）');
      return;
    }
    let payloadObj: Record<string, unknown>;
    try {
      payloadObj = forgePayload.trim() ? (JSON.parse(forgePayload) as Record<string, unknown>) : {};
    } catch {
      setForgeError('payload 不是合法 JSON');
      return;
    }
    if (forgeAlg === 'none') {
      setForgeResult(forgeJwtNone(payloadObj));
      return;
    }
    const r = await signJwtHS(payloadObj, forgeSecret, forgeAlg);
    if (r.success) setForgeResult(r.data);
    else setForgeError(r.error ?? 'SIGN_FAILED');
  };

  const isJwt = subTab === 'jwt' && jwtResult != null;
  const jwtTime = isJwt ? analyzeJwtTimeFields(jwtResult!.payload) : null;
  const jwtFindings: JwtSecurityFinding[] = isJwt
    ? checkJwtSecurity(jwtResult!.header, jwtResult!.payload)
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Sub tabs */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-slate-200 dark:border-slate-700 shrink-0 overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setSubTab(t.id);
              setDirection(t.hasEncode ? direction : 'decode');
              setOutput('');
              setError('');
              setJwtResult(null);
            }}
            className={`text-2xs px-2.5 py-1 rounded-md whitespace-nowrap transition-colors ${
              subTab === t.id
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Encode/Decode toggle */}
      {!isDecodeOnly && (
        <div className="flex items-center px-3 pt-2 shrink-0">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-md p-0.5">
            <button
              onClick={() => { setDirection('decode'); setOutput(''); setError(''); }}
              className={`text-2xs px-3 py-1 rounded transition-colors ${
                direction === 'decode'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              解码
            </button>
            <button
              onClick={() => { setDirection('encode'); setOutput(''); setError(''); }}
              className={`text-2xs px-3 py-1 rounded transition-colors ${
                direction === 'encode'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              编码
            </button>
          </div>
          {isDecodeOnly && <span />}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2 text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-1.5 shrink-0">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex flex-col flex-1 mx-3 mb-2 min-h-0">
        <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0">输入</div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="在此输入文本..."
          className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-slate-700 dark:text-slate-300 placeholder-slate-400 resize-none font-mono focus:ring-1 focus:ring-primary-500 outline-none"
        />
      </div>

      {/* Output */}
      <div className="flex flex-col flex-1 mx-3 mb-2 min-h-0">
        <div className="text-2xs text-slate-400 dark:text-slate-500 mb-0.5 shrink-0">输出</div>
        {subTab === 'jwt' && jwtResult ? (
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 space-y-2">
            {/* HEADER 深度视图 */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xs font-medium text-slate-500 dark:text-slate-400">HEADER</span>
                {typeof jwtResult.header.alg === 'string' && (
                  <span className="text-2xs px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 font-mono">
                    {jwtResult.header.alg}
                  </span>
                )}
              </div>
              {Object.entries(jwtResult.header).map(([k, v]) => (
                <div key={k} className="text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed break-all">
                  <span className="font-semibold">{k}</span>
                  {JWT_HEADER_FIELD_DOCS[k] && <span className="text-slate-400"> — {JWT_HEADER_FIELD_DOCS[k]}</span>}
                  <span className="text-slate-300 dark:text-slate-500">: </span>
                  <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
            </div>
            {/* PAYLOAD 深度视图（时间字段可读化 + 标准字段注释） */}
            <div>
              <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">PAYLOAD</div>
              {Object.entries(jwtResult.payload).map(([k, v]) => {
                const tf = jwtTime?.fields[k as 'exp' | 'nbf' | 'iat'];
                return (
                  <div key={k} className="text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed break-all">
                    <span className="font-semibold">{k}</span>
                    {JWT_PAYLOAD_FIELD_DOCS[k] && <span className="text-slate-400"> — {JWT_PAYLOAD_FIELD_DOCS[k]}</span>}
                    <span className="text-slate-300 dark:text-slate-500">: </span>
                    {tf ? (
                      <span>
                        {tf.human}（{tf.relative}）
                        {tf.state === 'expired' && <span className="text-red-500 ml-1">已过期</span>}
                        {tf.state === 'not-yet-valid' && <span className="text-amber-500 ml-1">未生效</span>}
                        {tf.state === 'valid' && <span className="text-green-500 ml-1">有效</span>}
                      </span>
                    ) : (
                      <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {/* SIGNATURE */}
            <div>
              <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">SIGNATURE</div>
              <pre className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap break-all">{jwtResult.signatureRaw}</pre>
              <div className="text-2xs text-slate-400 mt-0.5">签名不可解码，仅用于完整性校验</div>
            </div>
            {/* 安全风险检测（有发现才渲染） */}
            {jwtFindings.length > 0 && (
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                <div className="text-2xs font-medium text-slate-500 dark:text-slate-400 mb-1">风险检测</div>
                <div className="space-y-1">
                  {jwtFindings.map((f, i) => (
                    <div
                      key={i}
                      className={`rounded-md p-2 text-xs ${
                        f.level === 'high'
                          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          : f.level === 'medium'
                            ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-100 dark:bg-slate-700/40 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-semibold">{f.title}</div>
                      <div className="opacity-90 mt-0.5">{f.detail}</div>
                      <div className="opacity-75 mt-0.5">建议：{f.suggestion}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <textarea
            readOnly
            value={output}
            className="flex-1 min-h-[60px] text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-300 font-mono resize-none outline-none"
          />
        )}
        {output && (
          <button
            onClick={copyOutput}
            className="mt-1.5 self-end text-2xs px-3 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 rounded-md transition-colors"
          >
            复制
          </button>
        )}
      </div>

      {/* JWT 签发 / 伪造工具区 */}
      {subTab === 'jwt' && (
        <div className="mx-3 mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={() => setForgeOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-2xs font-medium text-slate-600 dark:text-slate-300"
          >
            <span>签发 / 伪造</span>
            <span className="text-slate-400">{forgeOpen ? '▾' : '▸'}</span>
          </button>
          {forgeOpen && (
            <div className="px-3 pb-3 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-2xs text-slate-500 dark:text-slate-400">算法</label>
                <select
                  value={forgeAlg}
                  onChange={(e) => setForgeAlg(e.target.value as JwtSignAlg)}
                  className="text-2xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300"
                >
                  <option value="HS256">HS256</option>
                  <option value="HS384">HS384</option>
                  <option value="HS512">HS512</option>
                  <option value="none">none（伪造）</option>
                </select>
                <button
                  onClick={fillForgePayload}
                  className="ml-auto text-2xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  用此 payload 重签
                </button>
              </div>
              <textarea
                value={forgePayload}
                onChange={(e) => setForgePayload(e.target.value)}
                placeholder={'payload JSON，例如 {"sub":"admin","exp":1700000000}'}
                className="w-full h-24 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300 font-mono resize-none outline-none"
              />
              {forgeAlg !== 'none' && (
                <input
                  type="password"
                  value={forgeSecret}
                  onChange={(e) => setForgeSecret(e.target.value)}
                  placeholder="密钥 secret（HS256/384/512 必填）"
                  className="w-full text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-slate-700 dark:text-slate-300 font-mono outline-none"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={doSign}
                  className="text-2xs px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700"
                >
                  {forgeAlg === 'none' ? '生成 alg=none 令牌' : '签发 Token'}
                </button>
                {forgeAlg === 'none' && (
                  <span className="text-2xs text-amber-600 dark:text-amber-400">
                    仅用于测试服务端是否校验签名，禁止用于未授权测试
                  </span>
                )}
              </div>
              {forgeError && (
                <div className="text-2xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                  {forgeError}
                </div>
              )}
              {forgeResult && (
                <div>
                  <div className="text-2xs text-slate-500 dark:text-slate-400 mb-0.5">结果</div>
                  <pre className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap break-all bg-white dark:bg-slate-800 rounded p-2 border border-slate-200 dark:border-slate-700">
                    {forgeResult}
                  </pre>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => copyText(forgeResult)}
                      className="text-2xs px-2 py-1 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded hover:bg-primary-100 dark:hover:bg-primary-500/20"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => setInput(forgeResult)}
                      className="text-2xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      解析此 Token
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EncodeDecodePanel;
