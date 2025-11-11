import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global error handler برای نادیده گرفتن خطاهای extension Chrome
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  
  // نادیده گرفتن خطاهای extension Chrome
  if (
    error?.stack?.includes('background.js') ||
    error?.stack?.includes('extension://') ||
    error?.stack?.includes('chrom') ||
    (error?.message === 'permission error' && error?.code === 403 && error?.httpStatus === 200) ||
    error?.reqInfo?.pathPrefix === '/site_integration'
  ) {
    event.preventDefault(); // جلوگیری از نمایش خطا در console
    return;
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

