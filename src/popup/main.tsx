// ============================================================
// Popup 入口
// 由 .spec/*.yaml 的 ui.component_interface 驱动生成
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
