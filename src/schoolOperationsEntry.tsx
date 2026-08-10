import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import SchoolOperationsPage from '../components/school-operations/SchoolOperationsPage';

const root = document.getElementById('root');
if (!root) throw new Error('School Operations root element not found.');

createRoot(root).render(
  <StrictMode>
    <SchoolOperationsPage />
  </StrictMode>,
);
