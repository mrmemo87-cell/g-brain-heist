import React from 'react';
import { createRoot } from 'react-dom/client';
import StudentAcademicProfile from '../components/student-progress/StudentAcademicProfile';

const params = new URLSearchParams(window.location.search);
const studentId = params.get('student');
const subject = params.get('subject');
const mode = studentId ? 'teacher' : 'student';

const root = document.getElementById('academic-profile-root');
if (!root) throw new Error('Academic profile root was not found');

createRoot(root).render(
  <React.StrictMode>
    <main style={{ maxWidth: 1480, margin: '0 auto', padding: 20 }}>
      <StudentAcademicProfile
        studentId={studentId}
        initialSubject={subject}
        mode={mode}
        onClose={() => {
          if (window.history.length > 1) window.history.back();
          else window.location.assign(mode === 'teacher' ? '/teacher' : '/');
        }}
      />
    </main>
  </React.StrictMode>,
);
