import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherInterventionIntelligencePage from '../components/student-progress/TeacherInterventionIntelligencePage';

const root=document.getElementById('teacher-interventions-root');
if(!root) throw new Error('Teacher interventions root was not found');
createRoot(root).render(<React.StrictMode><TeacherInterventionIntelligencePage/></React.StrictMode>);
