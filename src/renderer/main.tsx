import { createRoot } from 'react-dom/client';
import App from './app/App';
import './shell.css';
import '../ui/ui.css';

createRoot(document.getElementById('root')!).render(<App />);
