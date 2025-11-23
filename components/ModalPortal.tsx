import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

// Renders modal content into document.body so fixed positioning isn't affected by
// transformed parents (like the cinematic view container) and locks background scroll.
const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return createPortal(children, document.body);
};

export default ModalPortal;
