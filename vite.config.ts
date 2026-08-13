import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';


function copyBiologyQuestionAssetsPlugin() {
  return {
    name: 'copy-biology-question-assets',
    closeBundle() {
      const source = path.resolve(__dirname, 'components/Biology');
      const destination = path.resolve(__dirname, 'dist/components/Biology');
      if (!fs.existsSync(source)) return;
      fs.rmSync(destination, { recursive: true, force: true });
      fs.cpSync(source, destination, { recursive: true });
    },
  };
}

function teacherAcademicWorkspacePlugin() {
  return {
    name: 'teacher-academic-workspace-shell',
    resolveId(source: string) {
      // App.tsx lazy-loads this exact specifier. Resolve it directly to the
      // workspace shell so Academic Profiles and Interventions stay mounted
      // inside the existing Teacher Portal instead of navigating away.
      // TeacherPortalShell imports './TeacherPortal', so this does not recurse.
      if (source === './components/TeacherPortal') {
        return path.resolve(__dirname, 'components/TeacherPortalShell.tsx');
      }
      return null;
    },
  };
}

export const applyWritingGuidedReviewSpotlightSync = (source: string): { code: string; changed: boolean } => {
  const previous = '{renderAnnotatedText(activeCinematicText, cinematicRanges, cinematicIndex, handleRangeMount, true)}';
  const replacement = `{renderAnnotatedText(
                      activeCinematicText,
                      activeCinematicRange ? [activeCinematicRange] : [],
                      activeCinematicRange ? 0 : null,
                      (_, element) => {
                        if (cinematicIndex != null) handleRangeMount(cinematicIndex, element);
                      },
                      true
                    )}`;
  const first = source.indexOf(previous);
  if (first < 0) return { code: source, changed: false };
  if (source.indexOf(previous, first + previous.length) >= 0) {
    throw new Error('Writing Guided Review spotlight call is ambiguous.');
  }
  return { code: source.replace(previous, replacement), changed: true };
};

function writingGuidedReviewSpotlightSyncPlugin() {
  const writingHubPath = path.resolve(__dirname, 'src/pages/writing/WritingHub.tsx').replace(/\\/g, '/');
  return {
    name: 'writing-guided-review-spotlight-sync',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const cleanId = id.split('?')[0]?.replace(/\\/g, '/');
      if (cleanId !== writingHubPath) return null;
      const result = applyWritingGuidedReviewSpotlightSync(source);
      if (!result.changed) {
        throw new Error('Writing Guided Review spotlight sync marker was not found. Update the plugin with the source change.');
      }
      return { code: result.code, map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = env['GEMINI_API_KEY'];
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [writingGuidedReviewSpotlightSyncPlugin(), react(), teacherAcademicWorkspacePlugin(), copyBiologyQuestionAssetsPlugin()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
      },
      build: {
        chunkSizeWarningLimit: 800,
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html'),
            booked: path.resolve(__dirname, 'booked.html'),
            academicProfile: path.resolve(__dirname, 'academic-profile.html'),
            teacherAcademicProfiles: path.resolve(__dirname, 'teacher-academic-profiles.html'),
            schoolHeadLearningIntelligence: path.resolve(__dirname, 'school-head-learning-intelligence.html'),
            parentPortal: path.resolve(__dirname, 'parent-portal.html'),
            guardianManagement: path.resolve(__dirname, 'guardian-management.html'),
            teacherInterventions: path.resolve(__dirname, 'teacher-interventions.html'),
          },
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom'],
              'vendor-supabase': ['@supabase/supabase-js']
            }
          }
        }
      },
      resolve: {
        alias: {
          './components/TeacherPortal.tsx': path.resolve(__dirname, 'components/TeacherPortalIntegrated.tsx'),
          '@': path.resolve(__dirname, '.'),
          'react-router-dom': path.resolve(__dirname, 'src/lib/router.tsx'),
          '@tanstack/react-query': path.resolve(__dirname, 'src/lib/simple-react-query.tsx'),
        }
      }
    };
});