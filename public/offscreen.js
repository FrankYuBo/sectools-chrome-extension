// 在真实 Document 上下文中，navigator.clipboard 可用。
// 由 background 通过 chrome.offscreen.createDocument 加载本页面，
// 再通过 chrome.runtime.sendMessage 触发复制。
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'sec:copy') {
    const text = msg.text || '';
    navigator.clipboard
      .writeText(text)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 异步响应
  }
  return false;
});

// 脚本加载完成，通知 background 本页面已就绪（可接收复制消息）
chrome.runtime.sendMessage({ type: 'sec:offscreen-ready' }).catch(() => {
  /* background 尚未监听时忽略 */
});
