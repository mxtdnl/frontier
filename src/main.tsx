import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './ui/fonts.css';
import './ui/tokens.css';
import './ui/grid.css';
import './ui/components.css';

const el = document.getElementById('root');
if (!el) throw new Error('Root element missing');
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
