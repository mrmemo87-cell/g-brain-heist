export type CommanderRecruitSchool = 'neutral' | 'void' | 'storm' | 'rot' | 'grave';

export type CommanderRecruitIdentity = {
  catalogId: string | null;
  school: CommanderRecruitSchool;
  sigil: string;
  codename: string;
  doctrine: string;
  power: string;
  accent: string;
  accent2: string;
  glow: string;
  colorFilter: string;
};

type SchoolTheme = Omit<CommanderRecruitIdentity, 'catalogId' | 'codename' | 'doctrine'>;

const SCHOOL_THEMES: Record<CommanderRecruitSchool, SchoolTheme> = {
  neutral: {
    school: 'neutral',
    sigil: '◇',
    power: 'Tactical core',
    accent: '#67e8f9',
    accent2: '#94a3b8',
    glow: 'rgba(103,232,249,.34)',
    colorFilter: 'saturate(1.02)',
  },
  void: {
    school: 'void',
    sigil: '◆',
    power: 'Death Bolt',
    accent: '#e879f9',
    accent2: '#8b5cf6',
    glow: 'rgba(217,70,239,.42)',
    colorFilter: 'hue-rotate(230deg) saturate(1.22) contrast(1.03)',
  },
  storm: {
    school: 'storm',
    sigil: 'ϟ',
    power: 'Chain Surge',
    accent: '#67e8f9',
    accent2: '#3b82f6',
    glow: 'rgba(34,211,238,.42)',
    colorFilter: 'hue-rotate(158deg) saturate(1.18) contrast(1.03)',
  },
  rot: {
    school: 'rot',
    sigil: '✣',
    power: 'Rot Miasma',
    accent: '#bef264',
    accent2: '#d946ef',
    glow: 'rgba(163,230,53,.4)',
    colorFilter: 'hue-rotate(90deg) saturate(1.26) contrast(1.04)',
  },
  grave: {
    school: 'grave',
    sigil: '✦',
    power: 'Raise Dead',
    accent: '#d9f99d',
    accent2: '#facc15',
    glow: 'rgba(190,242,100,.38)',
    colorFilter: 'sepia(.18) hue-rotate(48deg) saturate(1.24) contrast(1.02)',
  },
};

const RECRUIT_PROFILES: Record<string, Pick<CommanderRecruitIdentity, 'codename' | 'doctrine'> & Partial<Pick<CommanderRecruitIdentity, 'sigil' | 'colorFilter'>>> = {
  neon_guard: {
    codename: 'Arc Warden',
    doctrine: 'Hold the lane. Build pressure.',
  },
  neon_bulwark: {
    codename: 'Thunder Bastion',
    doctrine: 'Absorb the hit. Keep the circuit alive.',
    sigil: '⬡',
  },
  shade_archer: {
    codename: 'Void Stalker',
    doctrine: 'Mark the opening. Strike from shadow.',
  },
  shade_deadeye: {
    codename: 'Null Marksman',
    doctrine: 'Trade safety for ruthless precision.',
    sigil: '⌖',
  },
  grave_bastion: {
    codename: 'Sepulchral Fortress',
    doctrine: 'Refuse collapse. Return what was lost.',
    sigil: '♜',
    colorFilter: 'sepia(.25) hue-rotate(45deg) saturate(1.34) contrast(1.04)',
  },
  plague_scribe: {
    codename: 'Decay Architect',
    doctrine: 'Turn the whole field into a liability.',
    sigil: '✣',
    colorFilter: 'hue-rotate(94deg) saturate(1.38) contrast(1.06)',
  },
  rift_reaver: {
    codename: 'Rift Marauder',
    doctrine: 'Break formation before it can answer.',
    sigil: '◈',
    colorFilter: 'hue-rotate(232deg) saturate(1.36) contrast(1.05)',
  },
  volt_seer: {
    codename: 'Arc Oracle',
    doctrine: 'Win the exchange before the counterstrike.',
    sigil: 'ϟ',
    colorFilter: 'hue-rotate(164deg) saturate(1.4) contrast(1.06)',
  },
};

export const normalizeCommanderSchool = (school: string | null | undefined): CommanderRecruitSchool =>
  school === 'void' || school === 'storm' || school === 'rot' || school === 'grave'
    ? school
    : 'neutral';

export const getCommanderRecruitIdentity = (
  catalogId: string | null | undefined,
  school: string | null | undefined,
): CommanderRecruitIdentity => {
  const normalizedSchool = normalizeCommanderSchool(school);
  const theme = SCHOOL_THEMES[normalizedSchool];
  const profile = catalogId ? RECRUIT_PROFILES[catalogId] : undefined;

  return {
    ...theme,
    catalogId: catalogId ?? null,
    sigil: profile?.sigil ?? theme.sigil,
    codename: profile?.codename ?? (normalizedSchool === 'neutral' ? 'Field Operative' : `${normalizedSchool.toUpperCase()} Operative`),
    doctrine: profile?.doctrine ?? 'Adapt to the field. Protect the formation.',
    colorFilter: profile?.colorFilter ?? theme.colorFilter,
  };
};

export const COMMANDER_RECRUIT_CATALOG_IDS = Object.freeze(Object.keys(RECRUIT_PROFILES));