/**
 * main.jsx - Entry point of the React app.
 * Loads the design system (CSS), then renders <App/> wrapped in the global providers:
 *   BrowserRouter (URLs) -> ToastProvider (notifications) -> ConfirmProvider (confirm dialogs)
 *   -> AuthProvider (who is logged in) -> CartProvider (shopping cart)
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/dashboard.css';
import './styles/store.css';
import { BrowserRouter } from './router/index.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Modal.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CartProvider } from './context/CartContext.jsx';
import App from './App.jsx';

// Safety net: any <img> that fails to load (even ones not using <Img>) gets the branded fallback.
window.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && !img.dataset.failed) {
    img.dataset.failed = '1';
    img.src = '/assets/images/fallback.svg';
  }
}, true);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
