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

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = env['GEMINI_API_KEY'];
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), teacherAcademicWorkspacePlugin(), copyBiologyQuestionAssetsPlugin()],
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
            schoolOperations: path.resolve(__dirname, 'school-operations.html'),
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
          'lucide-react': path.resolve(__dirname, 'components/school-operations/SchoolOpsIcons.tsx'),
        }
      }
    };
});
