import { describe, it, expect } from 'vitest';
import { parseAiDelta, readAiStream } from '../utils/ai-stream';
function stream(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
}
describe('AI SSE', () => {
  it('decodes split UTF-8, CRLF, comments and completion', async () => {
    const deltas: unknown[] = [];
    await readAiStream(stream(': ping\r\n\r\ndata: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"答案"}}]}\n\ndata: [DONE]\n\n'), d => deltas.push(d));
    expect(deltas).toEqual([{ content: '', reasoning: '思考' }, { content: '答案', reasoning: '' }]);
  });
  it('handles fallback, empty and wrong types', () => {
    expect(parseAiDelta(null)).toEqual({ content: '', reasoning: '' });
    expect(parseAiDelta({ choices: [{ message: { reasoning: 'r', content: 1 } }] })).toEqual({ content: '', reasoning: 'r' });
    expect(parseAiDelta({ choices: [{ delta: { reasoning_content: 'a', reasoning: 'b' } }] }).reasoning).toBe('a');
  });
  it('rejects malformed, error and truncated streams', async () => {
    for (const text of ['data: invalid\n\n', 'data: {"error":{"message":"bad"}}\n\n', 'data: {"choices":[]}\n\n']) {
      await expect(readAiStream(stream(text), () => {})).rejects.toThrow();
    }
  });
  it('accepts DONE without a final newline', async () => {
    await expect(readAiStream(stream('data: [DONE]'), () => {})).resolves.toBeUndefined();
  });
});
