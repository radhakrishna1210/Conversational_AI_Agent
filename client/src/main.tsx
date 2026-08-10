import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles.css';
// Resonance primitives layer — the shapes the Spandan_flagship_selection
// designs are built from. Loaded after styles.css so page-level rules there
// stay overridable by a component that opts into the design-system class.
import './styles/resonance.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
