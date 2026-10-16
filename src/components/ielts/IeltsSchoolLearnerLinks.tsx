import React from 'react';
import '../../styles/ielts-navigation.css';

interface IeltsSchoolLearnerLinksProps {
  onNavigate: (route: string) => void;
  active?: 'screeners' | 'targeted' | 'journey' | 'assigned';
}
const sections = [
  { id: 'screeners', route: '/ielts', label: 'Screeners', hint: 'Start, resume or view results', icon: '01' },
  { id: 'targeted', route: '/ielts/practice/targeted', label: 'Targeted Practice', hint: 'Your focused teacher tasks', icon: '02' },
  { id: 'journey', route: '/ielts/journey', label: 'My Journey', hint: 'Feedback and saved evidence', icon: '03' },
  { id: 'assigned', route: '/ielts/practice/assigned', label: 'School Assignments', hint: 'Sets assigned by your school', icon: '04' },
] as const;
export default function IeltsSchoolLearnerLinks({ onNavigate, active = 'screeners' }: IeltsSchoolLearnerLinksProps) {
  return (
    <nav aria-label="IELTS navigation" className="in-nav">
      {sections.map(section => (
        <a key={section.id} href={section.route} aria-current={active === section.id ? 'page' : undefined}
          onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(section.route); } }}>
          <span className="in-number" aria-hidden="true">{section.icon}</span>
          <span><strong>{section.label}</strong><small>{section.hint}</small></span>
        </a>
      ))}
    </nav>
  );
}
