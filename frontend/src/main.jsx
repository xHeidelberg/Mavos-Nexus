import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import FeedbackHost from './components/feedback';
import { AuthProvider } from './lib/auth';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <FeedbackHost />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
