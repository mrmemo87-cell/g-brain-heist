import React from 'react';
import { createRoot } from 'react-dom/client';
import ParentPortal from '../components/guardian/ParentPortal';

const root = document.getElementById('parent-portal-root');
if (!root) throw new Error('Parent portal root was not found');
createRoot(root).render(<React.StrictMode><ParentPortal /></React.StrictMode>);
