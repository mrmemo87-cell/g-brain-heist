export interface BiologyCambridgeChapter {
  chapter: number;
  title: string;
  slug: string;
  quizBaseId: string;
  questionCount: number;
  dataDir: string;
  partSizes: number[];
  description: string;
}

export interface BiologyCambridgePartRange {
  part: number;
  start: number;
  end: number;
  size: number;
}

export const BIOLOGY_IMAGE_CHAPTERS: readonly BiologyCambridgeChapter[] = Object.freeze([
  {
    chapter: 2,
    title: 'Biological molecules',
    slug: 'biological_molecules',
    quizBaseId: 'as_biology_ch2_biological_molecules',
    questionCount: 338,
    dataDir: 'biology_ch2_extraction_clean_cropped',
    partSizes: [34, 34, 34, 34, 34, 34, 34, 34, 33, 33],
    description: 'Chapter 2 multiple-choice practice on carbohydrates, lipids, proteins, water, and biochemical tests.',
  },
  {
    chapter: 3,
    title: 'Enzymes',
    slug: 'enzymes',
    quizBaseId: 'as_biology_ch3_enzymes',
    questionCount: 140,
    dataDir: 'biology_ch3_extraction_delimiter_clean',
    partSizes: [35, 35, 35, 35],
    description: 'Chapter 3 multiple-choice practice on enzyme action, kinetics, inhibition, and factors affecting rate.',
  },
  {
    chapter: 4,
    title: 'Cell membranes and transport',
    slug: 'cell_membranes_transport',
    quizBaseId: 'as_biology_ch4_cell_membranes_transport',
    questionCount: 186,
    dataDir: 'biology_ch4_extraction_delimiter_clean',
    partSizes: [31, 31, 31, 31, 31, 31],
    description: 'Chapter 4 multiple-choice practice on membrane structure, diffusion, osmosis, and active transport.',
  },
  {
    chapter: 5,
    title: 'The mitotic cell cycle',
    slug: 'mitotic_cell_cycle',
    quizBaseId: 'as_biology_ch5_mitotic_cell_cycle',
    questionCount: 172,
    dataDir: 'biology_ch5_extraction_delimiter_clean',
    partSizes: [35, 35, 34, 34, 34],
    description: 'Chapter 5 multiple-choice practice on chromosomes, mitosis, cytokinesis, and cancer.',
  },
  {
    chapter: 6,
    title: 'Nucleic acids and protein synthesis',
    slug: 'nucleic_acids_protein_synthesis',
    quizBaseId: 'as_biology_ch6_nucleic_acids_protein_synthesis',
    questionCount: 254,
    dataDir: 'biology_ch6_extraction_delimiter_clean',
    partSizes: [32, 32, 32, 32, 32, 32, 31, 31],
    description: 'Chapter 6 multiple-choice practice on DNA/RNA structure, replication, transcription, and translation.',
  },
  {
    chapter: 7,
    title: 'Transport in plants',
    slug: 'transport_in_plants',
    quizBaseId: 'as_biology_ch7_transport_in_plants',
    questionCount: 243,
    dataDir: 'biology_ch7_extraction_delimiter_clean',
    partSizes: [35, 35, 35, 35, 35, 34, 34],
    description: 'Chapter 7 multiple-choice practice on xylem, phloem, transpiration, and translocation.',
  },
  {
    chapter: 8,
    title: 'Transport in mammals',
    slug: 'transport_in_mammals',
    quizBaseId: 'as_biology_ch8_transport_in_mammals',
    questionCount: 259,
    dataDir: 'biology_ch8_extraction_delimiter_clean',
    partSizes: [33, 33, 33, 32, 32, 32, 32, 32],
    description: 'Chapter 8 multiple-choice practice on heart structure, blood vessels, haemoglobin, and circulation.',
  },
  {
    chapter: 9,
    title: 'Gas exchange and smoking',
    slug: 'gas_exchange_smoking',
    quizBaseId: 'as_biology_ch9_gas_exchange_smoking',
    questionCount: 140,
    dataDir: 'biology_ch9_extraction_delimiter_clean',
    partSizes: [35, 35, 35, 35],
    description: 'Chapter 9 multiple-choice practice on lung structure, gas exchange surfaces, and effects of smoking.',
  },
  {
    chapter: 10,
    title: 'Infectious disease',
    slug: 'infectious_disease',
    quizBaseId: 'as_biology_ch10_infectious_disease',
    questionCount: 253,
    dataDir: 'biology_ch10_extraction_delimiter_clean',
    partSizes: [32, 32, 32, 32, 32, 31, 31, 31],
    description: 'Chapter 10 multiple-choice practice on pathogens, transmission, antibiotics, and disease prevention.',
  },
  {
    chapter: 11,
    title: 'Immunity',
    slug: 'immunity',
    quizBaseId: 'as_biology_ch11_immunity',
    questionCount: 139,
    dataDir: 'biology_ch11_extraction_delimiter_clean',
    partSizes: [35, 35, 35, 34],
    description: 'Chapter 11 multiple-choice practice on immune response, antibodies, vaccination, and autoimmunity.',
  },
]);

export function getBiologyChapterPartRanges(chapter: BiologyCambridgeChapter): BiologyCambridgePartRange[] {
  let start = 1;
  return chapter.partSizes.map((size, index) => {
    const range = { part: index + 1, start, end: start + size - 1, size };
    start += size;
    return range;
  });
}
