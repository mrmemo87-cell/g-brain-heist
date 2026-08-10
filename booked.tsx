import React from 'react';
import ReactDOM from 'react-dom/client';
import BookedDemoPage from './src/pages/BookedDemoPage';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Could not find the booking page root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BookedDemoPage />
  </React.StrictMode>,
);
