import { useLayoutEffect, useState } from 'react';

/** Keep the desktop navigation inside the visible viewport, including before it sticks. */
export function useTeacherSidebarViewport() {
  // A callback ref also attaches after the portal's initial loading screen.
  const [sidebar, setSidebar] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!sidebar) return;
    const desktop = window.matchMedia('(min-width: 1025px)');
    let frame: number | null = null;
    let previousHeight = '';

    const measure = () => {
      frame = null;
      if (!desktop.matches) {
        sidebar.style.removeProperty('--teacher-sidebar-available-height');
        previousHeight = '';
        return;
      }
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
      const top = Math.max(viewportTop, sidebar.getBoundingClientRect().top);
      const height = `${Math.max(0, Math.floor(viewportBottom - top - 12))}px`;
      if (height !== previousHeight) {
        sidebar.style.setProperty('--teacher-sidebar-available-height', height);
        previousHeight = height;
      }
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(sidebar);
    const container = sidebar.closest('.teacher-portal-container');
    if (container) observer.observe(container);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    desktop.addEventListener('change', schedule);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      desktop.removeEventListener('change', schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
      sidebar.style.removeProperty('--teacher-sidebar-available-height');
    };
  }, [sidebar]);

  return setSidebar;
}
