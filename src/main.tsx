import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './utils/errorLog';
import './index.css';

// Catches what the error boundary cannot: throws outside rendering, and
// unhandled promise rejections.
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <MantineProvider>
      <App />
    </MantineProvider>
  </ErrorBoundary>
);
