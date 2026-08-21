from pathlib import Path
import subprocess
import sys

portal = Path('components/TeacherPortal.tsx')
marker = 'const [editingAssignment, setEditingAssignment]'

if marker in portal.read_text(encoding='utf-8'):
    print('Assignment editing source already materialized; skipping patch.')
else:
    subprocess.run([sys.executable, 'scripts/patch_assignment_edit_feature.py'], check=True)
    subprocess.run([sys.executable, 'scripts/fix_assignment_patch_output.py'], check=True)
    print('Assignment editing source materialized successfully.')

subprocess.run([sys.executable, 'scripts/patch_assignment_topic_filter.py'], check=True)
subprocess.run([sys.executable, 'scripts/patch_assignment_class_folders.py'], check=True)
subprocess.run([sys.executable, 'scripts/patch_academic_roster_confirmation_ui.py'], check=True)
