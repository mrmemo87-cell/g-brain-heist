import React from 'react';
import { createRoot } from 'react-dom/client';
import GuardianManagementPage from '../components/guardian/GuardianManagementPage';

const root = document.getElementById('guardian-management-root');
if (!root) throw new Error('Guardian management root was not found');
createRoot(root).render(<React.StrictMode><GuardianManagementPage /></React.StrictMode>);
