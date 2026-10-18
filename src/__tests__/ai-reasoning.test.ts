// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderAssistant } from '../content/chat-widget';
it('shows safe reasoning, expands while thinking and collapses for answers', () => {
  const el = document.createElement('div');
  renderAssistant(el, { role: 'assistant', content: '', reasoning: '<img src=x onerror=alert(1)>', pending: true });
  expect(el.querySelector('details')?.open).toBe(true);
  expect(el.querySelector('img')).toBeNull();
  expect(el.textContent).toContain('<img');
  renderAssistant(el, { role: 'assistant', content: 'answer', reasoning: 'r', pending: true });
  expect(el.querySelector('details')?.open).toBe(false);
  renderAssistant(el, { role: 'assistant', content: '', reasoning: 'r' });
  expect(el.textContent).toContain('模型未返回回答正文');
  renderAssistant(el, { role: 'assistant', content: 'answer' });
  expect(el.querySelector('details')).toBeNull();
});
