import React, { useEffect, useRef, useState } from 'react';
import './AssignmentToolbar.css';

type Status = 'all' | 'in-progress' | 'completed';
interface Props {
  classes: string[];
  counts: Map<string, number>;
  total: number;
  shown: number;
  selectedClass: string;
  onClass: (value: string) => void;
  search: string;
  onSearch: (value: string) => void;
  subjects: string[];
  subject: string;
  onSubject: (value: string) => void;
  status: Status;
  onStatus: (value: Status) => void;
  canCreate: boolean;
  onAssignment: () => void;
  onDiagnostic: () => void;
}

export default function AssignmentToolbar(props: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!createOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !createRef.current?.contains(event.target)) setCreateOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCreateOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [createOpen]);
  const options = [
    { value: 'all', label: 'All classes', count: props.total },
    ...props.classes.map(value => ({ value, label: value, count: props.counts.get(value.toLocaleLowerCase()) || 0 })),
    { value: 'individual', label: 'Individual', count: props.counts.get('individual') || 0 },
  ];
  const filtered = props.search !== '' || props.subject !== 'all' || props.status !== 'all' || props.selectedClass !== 'all';
  const clear = () => { props.onClass('all'); props.onSearch(''); props.onSubject('all'); props.onStatus('all'); };
  const create = (action: () => void) => { setCreateOpen(false); action(); };
  return <section className="assignment-toolbar" aria-label="Assignment workspace controls">
    <header className="assignment-toolbar__heading">
      <div><h2>Assignments</h2><p>{props.total} assignment{props.total === 1 ? '' : 's'}</p></div>
      <div className="assignment-toolbar__create" ref={createRef}>
        <button ref={triggerRef} type="button" className="assignment-toolbar__primary" disabled={!props.canCreate} aria-expanded={createOpen} aria-controls="assignment-create-options" onClick={() => setCreateOpen(open => !open)}><span aria-hidden="true">+</span> Create</button>
        {createOpen && <div id="assignment-create-options" className="assignment-toolbar__create-options">
          <button type="button" onClick={() => create(props.onAssignment)}><strong>New assignment</strong><span>Choose your questions</span></button>
          <button type="button" onClick={() => create(props.onDiagnostic)}><strong>Create diagnostic</strong><span>Find strengths and next steps</span></button>
        </div>}
      </div>
    </header>
    <div className="assignment-toolbar__classes" aria-label="Assignment folders by class">
      {options.map(option => <button type="button" key={option.value} aria-pressed={props.selectedClass.toLocaleLowerCase() === option.value.toLocaleLowerCase()} onClick={() => props.onClass(option.value)}>{option.label}<span>{option.count}</span></button>)}
    </div>
    <label className="assignment-toolbar__mobile-class"><span>Class</span><select value={props.selectedClass} onChange={event => props.onClass(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label} · {option.count}</option>)}</select></label>
    <div className="assignment-toolbar__filters">
      <label className="assignment-toolbar__search"><span className="assignment-toolbar__sr">Search assignments</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" placeholder="Search assignments" value={props.search} onChange={event => props.onSearch(event.target.value)}/></label>
      <button type="button" className="assignment-toolbar__filter-button" aria-expanded={filtersOpen} aria-controls="assignment-subject-filter" onClick={() => setFiltersOpen(open => !open)}>Filters{props.subject !== 'all' && <span aria-label="1 active subject filter">1</span>}</button>
      <div className="assignment-toolbar__status" role="group" aria-label="Assignment progress">{([['all', 'All'], ['in-progress', 'In progress'], ['completed', 'Completed']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={props.status === value} onClick={() => props.onStatus(value)}>{label}</button>)}</div>
    </div>
    {filtersOpen && <label id="assignment-subject-filter" className="assignment-toolbar__subject"><span>Subject</span><select value={props.subject} onChange={event => props.onSubject(event.target.value)}><option value="all">All subjects</option>{props.subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select></label>}
    {filtered && <div className="assignment-toolbar__summary"><span role="status">{props.shown} of {props.total} shown{props.subject !== 'all' ? ` · ${props.subject}` : ''}</span><button type="button" onClick={clear}>Clear filters</button></div>}
  </section>;
}
