import AccessGate from './AccessGate.jsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './design.css';
import './codex.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><AccessGate><App /></AccessGate></React.StrictMode>);
