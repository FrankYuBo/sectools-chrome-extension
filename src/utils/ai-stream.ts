/** OpenAI-compatible SSE decoder; independent of browser UI and Chrome APIs. */
export interface AiDelta { content: string; reasoning: string }
export function parseAiDelta(value: unknown): AiDelta {
  const data = value as { error?: { message?: string }; choices?: Array<{ delta?: Record<string, unknown>; message?: Record<string, unknown> }> };
  if (data?.error) throw new Error(data.error.message || 'AI 流返回错误');
  const message = data?.choices?.[0]?.delta ?? data?.choices?.[0]?.message;
  const reasoning = typeof message?.reasoning_content === 'string' && message.reasoning_content ? message.reasoning_content : message?.reasoning;
  return { content: typeof message?.content === 'string' ? message.content : '', reasoning: typeof reasoning === 'string' ? reasoning : '' };
}
export async function readAiStream(body: ReadableStream<Uint8Array>, onDelta: (delta: AiDelta) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lines: string[] = [];
  let done = false;
  const dispatch = () => {
    if (!lines.length) return;
    const data = lines.join('\n');
    lines = [];
    if (data.trim() === '[DONE]') { done = true; return; }
    onDelta(parseAiDelta(JSON.parse(data)));
  };
  const line = (text: string) => {
    if (!text) dispatch();
    else if (text.startsWith('data:')) lines.push(text.slice(5).replace(/^ /, ''));
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let match: RegExpExecArray | null;
      while (!done && (match = /\r\n|\r(?!$)|\n/.exec(buffer))) {
        line(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
      if (chunk.done) {
        if (buffer) line(buffer.replace(/\r$/, ''));
        dispatch();
        if (!done) throw new Error('AI 响应意外中断，请重试');
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
