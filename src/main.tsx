import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import './styles/responsive.css';
import { installResponsiveTouch } from './ui/responsive-touch';
import { failBoot, prepareBoot } from './startup/boot';

prepareBoot();
installResponsiveTouch();
createRoot(document.getElementById('root')!, {
  onUncaughtError: (error) => { console.error(error); failBoot(); },
}).render(<App />);
