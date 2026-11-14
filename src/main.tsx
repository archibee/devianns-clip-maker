import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import './styles/responsive.css';
import { installResponsiveTouch } from './ui/responsive-touch';

installResponsiveTouch();
createRoot(document.getElementById('root')!).render(<App />);
