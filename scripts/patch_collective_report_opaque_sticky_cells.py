from pathlib import Path


component_path = Path('components/CollectiveAssignmentReport.tsx')
text = component_path.read_text(encoding='utf-8')

# The collective report uses sticky columns on both sides of a horizontally
# scrolling table. Any alpha background on those sticky surfaces lets the
# scrolling assignment cells show through underneath them. Keep the same
# visual palette, but make every relevant table surface fully opaque.
for old, new in (
    ('bg-slate-50/70', 'bg-slate-50'),
    ('hover:bg-cyan-50/40', 'hover:bg-cyan-50'),
    ('bg-purple-50/60', 'bg-purple-50'),
    ('bg-slate-200/60', 'bg-slate-200'),
    ('bg-slate-50/95', 'bg-slate-50'),
    ('bg-slate-50/50', 'bg-slate-50'),
):
    text = text.replace(old, new)

component_path.write_text(text, encoding='utf-8')

css_path = Path('components/CollectiveAssignmentReport.css')
css = css_path.read_text(encoding='utf-8')
marker = '/* Opaque sticky cells: scrolling assignment columns must never bleed through. */'
if marker not in css:
    css += f'''\n{marker}\n.collective-results-table tbody tr:nth-child(odd)>.collective-results-student-cell,\n.collective-results-table tbody tr:nth-child(odd)>.collective-results-class-cell,\n.collective-results-table tbody tr:nth-child(odd)>.collective-results-status-cell{{background:#fff}}\n.collective-results-table tbody tr:nth-child(even)>.collective-results-student-cell,\n.collective-results-table tbody tr:nth-child(even)>.collective-results-class-cell,\n.collective-results-table tbody tr:nth-child(even)>.collective-results-status-cell{{background:#f8fafc}}\n.collective-results-table tbody tr:hover>.collective-results-student-cell,\n.collective-results-table tbody tr:hover>.collective-results-class-cell,\n.collective-results-table tbody tr:hover>.collective-results-status-cell{{background:#ecfeff}}\n.collective-results-table thead .collective-results-student-cell,\n.collective-results-table thead .collective-results-class-cell,\n.collective-results-table thead .collective-results-average-cell,\n.collective-results-table thead .collective-results-status-cell{{background-color:#f1f5f9}}\n'''
    css_path.write_text(css, encoding='utf-8')

print('Collective report sticky surfaces are fully opaque.')
