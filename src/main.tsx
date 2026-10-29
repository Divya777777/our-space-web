import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installHistoryRules } from './lib/historyRules';
// One font everywhere: Outfit (variable, 100–900), bundled with the site — no Google Fonts request.
import '@fontsource-variable/outfit';
import './styles.css';

// Before the router starts: back on Home leaves the site, back elsewhere goes Home.
installHistoryRules(import.meta.env.BASE_URL);

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
