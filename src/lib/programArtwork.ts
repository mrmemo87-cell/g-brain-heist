import '../styles/program-artwork.css';

export type ProgramArtworkKey = 'admissions' | 'cambridge' | 'ielts' | 'writing';

type ProgramArtworkDefinition = {
  src: string;
  alt: string;
  objectPosition: string;
};

const PROGRAM_STORAGE_BASE = 'https://sozodkxwhubespiedgxm.supabase.co/storage/v1/object/public/PROGRAMS';

export const PROGRAM_ARTWORK: Record<ProgramArtworkKey, ProgramArtworkDefinition> = {
  admissions: {
    src: `${PROGRAM_STORAGE_BASE}/admissions.png`,
    alt: 'Brains Heist Admissions programme artwork',
    objectPosition: 'center',
  },
  cambridge: {
    src: `${PROGRAM_STORAGE_BASE}/cambridge.png`,
    alt: 'Brains Heist Cambridge programme artwork',
    objectPosition: 'center',
  },
  ielts: {
    src: `${PROGRAM_STORAGE_BASE}/ielts.png`,
    alt: 'Brains Heist IELTS programme artwork',
    objectPosition: 'center',
  },
  writing: {
    src: `${PROGRAM_STORAGE_BASE}/writing%20hub.png`,
    alt: 'Brains Heist Writing Hub programme artwork',
    objectPosition: 'center',
  },
};
