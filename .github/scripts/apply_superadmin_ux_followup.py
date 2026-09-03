from pathlib import Path

path = Path('components/admin/tabs/DashboardTab.tsx')
source = path.read_text(encoding='utf-8')
old = "{ key: 'bhMembers', label: 'Brain Heist members', detail: 'Core Brain Heist product accounts', accent: 'sky' },"
new = "{ key: 'bhMembers', label: 'Brains Heist members', detail: 'Core Brains Heist product accounts', accent: 'sky' },"
count = source.count(old)
if count != 1:
    raise SystemExit(f'Brains Heist product naming: expected exactly one match, found {count}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('Applied guarded Superadmin UX follow-up naming fix.')
