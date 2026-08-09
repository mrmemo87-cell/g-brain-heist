import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherAcademicProfilesPage from '../components/student-progress/TeacherAcademicProfilesPage';

const root = document.getElementById('teacher-academic-profiles-root');
if (!root) throw new Error('Teacher academic profiles root was not found');

createRoot(root).render(
  <React.StrictMode>
    <main style={{ maxWidth: 1480, margin: '0 auto', padding: 20 }}>
      <TeacherAcademicProfilesPage />
    </main>
  </React.StrictMode>,
);
