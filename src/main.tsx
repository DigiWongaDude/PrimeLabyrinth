import React from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';
import SciFiCorridor from './SciFiCorridor';

const mount = document.getElementById('app');

if (mount) {
  const root = ReactDOM.createRoot(mount);
  root.render(
    <React.StrictMode>
      <SciFiCorridor />
    </React.StrictMode>,
  );
}
