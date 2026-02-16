import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './App';
import { css } from './styles';

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<App />);
}
