import React from 'react';
import '../../styles/ielts-navigation.css';

interface IeltsSchoolLearnerLinksProps {
  onNavigate: (route: string) => void;
  active?: 'screeners' | 'targeted' | 'journey' | 'assigned';
}
const sections = [
  { id: 'screeners', route: '/ielts', label: 'Home', hint: 'Your work and starting checks' },
  { id: 'assigned', route: '/ielts/practice/assigned', label: 'Assignments', hint: 'Practice sets from your teachers' },
  { id: 'targeted', route: '/ielts/practice/targeted', label: 'Targeted practice', hint: 'Short tasks chosen for you' },
  { id: 'journey', route: '/ielts/journey', label: 'My journey', hint: 'Feedback and saved work' },
] as const;
export default function IeltsSchoolLearnerLinks({ onNavigate, active = 'screeners' }: IeltsSchoolLearnerLinksProps) {
  return (
    <nav aria-label="IELTS navigation" className="in-nav">
      {sections.map(section => (
        <a key={section.id} href={section.route} aria-current={active === section.id ? 'page' : undefined}
          onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(section.route); } }}>
          <span><strong>{section.label}</strong><small>{section.hint}</small></span>
        </a>
      ))}
    </nav>
  );
}
