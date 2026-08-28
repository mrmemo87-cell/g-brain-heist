from pathlib import Path


def patch(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


patch(
    'src/lib/brains_heist/writingRepository.ts',
    "    attempts: attemptRows.map((row: any) => row.payload),",
    """    attempts: attemptRows.map((row: any) => ({
      ...(row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {}),
      // The database column is the academic-year authority. Keep it in the
      // hydrated in-memory attempt so the UI does not have to infer year from
      // dates (important during pre-term rollover windows).
      academic_year_id: typeof row?.academic_year_id === 'string'
        ? row.academic_year_id
        : (typeof row?.payload?.academic_year_id === 'string' ? row.payload.academic_year_id : null),
    })),""",
    'hydrate writing attempt academic year',
)

patch(
    'src/lib/brains_heist/writingIntegrationService.ts',
    "  created_at: string;\n  prompt_text?: string;",
    "  created_at: string;\n  academic_year_id?: string | null;\n  prompt_text?: string;",
    'writing attempt academic year type',
)

patch(
    'src/lib/brains_heist/writingIntegrationService.ts',
    "  prompt_id: string | null;\n  created_at: string;",
    "  prompt_id: string | null;\n  created_at: string;\n  academic_year_id?: string | null;",
    'writing history academic year type',
)

patch(
    'src/lib/brains_heist/writingIntegrationService.ts',
    "      prompt_id: attempt.prompt_id ?? null,\n      created_at: attempt.created_at,",
    "      prompt_id: attempt.prompt_id ?? null,\n      created_at: attempt.created_at,\n      academic_year_id: attempt.academic_year_id ?? null,",
    'writing history academic year mapping',
)

patch(
    'src/pages/writing/WritingHub.tsx',
    """        entries: item.entries.filter((entry) => {
          const createdAt = Date.parse(entry.created_at);
          return Number.isFinite(createdAt) && createdAt >= startsAt && createdAt <= endsAt;
        }),""",
    """        entries: item.entries.filter((entry) => {
          // Prefer the persisted academic-year authority. Date ranges are only
          // a fallback for legacy/offline attempts that predate year tagging.
          if (entry.academic_year_id) return entry.academic_year_id === selectedAcademicYear.id;
          const createdAt = Date.parse(entry.created_at);
          if (!Number.isFinite(createdAt)) return false;
          const dateMatchedYear = academicYears.find((year) => {
            const yearStart = Date.parse(`${year.startsOn}T00:00:00.000Z`);
            const yearEnd = Date.parse(`${year.endsOn}T23:59:59.999Z`);
            return createdAt >= yearStart && createdAt <= yearEnd;
          });
          if (dateMatchedYear) return dateMatchedYear.id === selectedAcademicYear.id;
          // If the school has already marked the next year current before its
          // formal start date, untagged new in-memory work belongs to that
          // operational current year rather than disappearing from the UI.
          return selectedAcademicYear.status === 'current';
        }),""",
    'writing hub database year authority',
)

patch(
    'src/pages/writing/WritingHub.tsx',
    "  }, [allWritingHistoryByGenre, selectedAcademicYear]);",
    "  }, [academicYears, allWritingHistoryByGenre, selectedAcademicYear]);",
    'writing hub year filter dependencies',
)

print('Writing academic-year authority patched.')
