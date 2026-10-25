import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// One font everywhere: Outfit (variable, 100–900), bundled with the site — no Google Fonts request.
import '@fontsource-variable/outfit';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
