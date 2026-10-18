"""Writing Task 1 visuals for mock tests and extension lessons: process diagrams, before/after maps and pie charts.
All data are fictional practice data; every figure carries its note."""
import textwrap

INK, PRIMARY, MUTED, LINE, WASH = '#15243A', '#1746B0', '#4C6076', '#DCE5EF', '#EEF3FA'
PALETTE = ['#1746B0', '#C2410C', '#0E7490', '#6D28D9', '#4C6076', '#B45309', '#15803D']


def _plt():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11})
    return plt


def render(fig, dest):
    kind = fig['type']
    if kind == 'process':
        return process(fig, dest)
    if kind == 'maps':
        return maps(fig, dest)
    if kind == 'pies':
        return pies(fig, dest)
    if kind == 'diagram':
        return diagram(fig, dest)
    raise ValueError(f'unknown figure type {kind}')


def diagram(fig, dest):
    """A labelled schematic (for diagram-labelling questions): simple shapes, air or water flows drawn as arrowed paths,
    and numbered labels joined to the part they name by a leader line."""
    from matplotlib.patches import Rectangle, Polygon
    plt = _plt()
    (x0, x1), (y0, y1) = fig.get('xlim', (0, 100)), fig.get('ylim', (0, 80))
    W = 7.4
    f, ax = plt.subplots(figsize=(W, W * (y1 - y0) / (x1 - x0) + 0.6), dpi=200)
    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect('equal'); ax.axis('off')
    fills = {'building': ('#FFFFFF', INK), 'water': ('#DBEAFE', '#3B82F6'), 'ground': ('#EDE6DA', '#A8987D'),
             'dark': (INK, INK), 'wall': ('#F1F5F9', INK), 'sky': ('#FFFFFF', '#FFFFFF')}
    for s in fig.get('shapes', []):
        fc, ec = fills[s.get('kind', 'building')]
        if 'rect' in s:
            x, y, w, h = s['rect']
            ax.add_patch(Rectangle((x, y), w, h, fc=fc, ec=ec, lw=s.get('lw', 1.4), zorder=s.get('z', 1)))
        elif 'poly' in s:
            ax.add_patch(Polygon(s['poly'], closed=True, fc=fc, ec=ec, lw=s.get('lw', 1.4), zorder=s.get('z', 1)))
        elif 'line' in s:
            xs, ys = zip(*s['line'])
            ax.plot(xs, ys, color=ec, lw=s.get('lw', 1.6), zorder=s.get('z', 2))
        if s.get('text'):
            x, y = s.get('text_at') or ((s['rect'][0] + s['rect'][2] / 2, s['rect'][1] + s['rect'][3] / 2) if 'rect' in s else s['poly'][0])
            ax.text(x, y, s['text'], ha='center', va='center', fontsize=8.5, color=MUTED, style='italic', zorder=6)
    flow_colour = {'cool': '#0E7490', 'warm': '#C2410C', 'water': '#3B82F6'}
    for fl in fig.get('flows', []):
        pts = fl['points']; c = flow_colour.get(fl.get('kind', 'cool'), INK)
        xs, ys = zip(*pts)
        ax.plot(xs[:-1] + (xs[-1],), ys, color=c, lw=2.2, ls=fl.get('ls', '-'), zorder=4, solid_capstyle='round')
        ax.annotate('', xy=pts[-1], xytext=pts[-2], arrowprops=dict(arrowstyle='-|>', color=c, lw=2.2, mutation_scale=16), zorder=5)
    for lb in fig.get('labels', []):
        ha = lb.get('ha', 'left')
        if lb.get('to'):
            ax.annotate('', xy=lb['to'], xytext=lb['at'], arrowprops=dict(arrowstyle='-', color=MUTED, lw=0.9, shrinkA=2, shrinkB=0), zorder=6)
            ax.plot(*lb['to'], marker='o', ms=3, color=MUTED, zorder=7)
        ax.text(lb['at'][0], lb['at'][1], lb['text'], ha=ha, va='center', fontsize=9.5, color=INK, zorder=8,
                fontweight='bold' if lb.get('question') else 'normal',
                bbox=dict(boxstyle='round,pad=0.25', fc='white', ec=PRIMARY if lb.get('question') else 'none', lw=0.9))
    ax.set_title(fig['title'], fontsize=13, fontweight='bold', color=INK, loc='left')
    if fig.get('key'):
        ax.text(x1, y0 + 1, fig['key'], ha='right', va='bottom', fontsize=8.2, color=MUTED)
    f.text(0.01, 0.01, fig.get('note', ''), fontsize=8.5, color=MUTED)
    f.tight_layout(rect=(0, 0.03, 1, 1)); f.savefig(dest); plt.close(f)
    return dest


def process(fig, dest):
    """Numbered stages laid out in a snake of rows, with an optional side branch."""
    from matplotlib.patches import FancyBboxPatch
    plt = _plt()
    steps = fig['steps']
    per_row = fig.get('per_row', 3)
    rows = -(-len(steps) // per_row)
    bw, bh, gx, gy = 2.6, 1.15, 0.9, 0.75
    W = 0.8 + per_row * bw + (per_row - 1) * gx
    H = rows * (bh + gy) + 0.9
    f, ax = plt.subplots(figsize=(W, H * 0.92), dpi=200)
    ax.set_xlim(0, W); ax.set_ylim(0, H); ax.axis('off')
    pos = []
    for i, text in enumerate(steps):
        r, c = divmod(i, per_row)
        if r % 2:
            c = per_row - 1 - c
        x = 0.4 + c * (bw + gx); y = H - 0.6 - (r + 1) * (bh + gy) + gy
        pos.append((x, y))
        ax.add_patch(FancyBboxPatch((x, y), bw, bh, boxstyle='round,pad=0.02,rounding_size=0.12', facecolor='#FFFFFF', edgecolor=PRIMARY, linewidth=1.6))
        ax.text(x + 0.18, y + bh - 0.22, str(i + 1), fontsize=10, fontweight='bold', color=PRIMARY, va='center')
        ax.text(x + bw / 2, y + bh / 2 - 0.05, '\n'.join(textwrap.wrap(text, 22)), ha='center', va='center', fontsize=9.6, color=INK)
    for i in range(len(steps) - 1):
        (x0, y0), (x1, y1) = pos[i], pos[i + 1]
        if abs(y0 - y1) < 0.01:
            a, b = ((x0 + bw, y0 + bh / 2), (x1, y1 + bh / 2)) if x1 > x0 else ((x0, y0 + bh / 2), (x1 + bw, y1 + bh / 2))
        else:
            a, b = (x0 + bw / 2, y0), (x1 + bw / 2, y1 + bh)
        ax.annotate('', xy=b, xytext=a, arrowprops=dict(arrowstyle='-|>', color=INK, lw=1.4, mutation_scale=14))
    br = fig.get('branch')
    if br:
        x, y = pos[br['from']]
        bx = x + bw / 2; by = y - 0.05
        ax.annotate('', xy=(bx + 0.9, by - 0.42), xytext=(bx, by), arrowprops=dict(arrowstyle='-|>', color=MUTED, lw=1.2, ls='--'))
        ax.text(bx + 0.98, by - 0.5, br['label'], fontsize=8.8, color=MUTED, style='italic', va='center')
    ax.set_title(fig['title'], fontsize=13, fontweight='bold', color=INK, loc='left')
    f.text(0.01, 0.01, fig.get('note', ''), fontsize=8.5, color=MUTED)
    f.tight_layout(rect=(0, 0.03, 1, 1)); f.savefig(dest); plt.close(f)
    return dest


def maps(fig, dest):
    """Two plans of the same place side by side (for example, 2005 and today)."""
    from matplotlib.patches import FancyBboxPatch, Rectangle
    plt = _plt()
    n = len(fig['plans'])
    f, axes = plt.subplots(1, n, figsize=(5.6 * n, 5.6), dpi=200, squeeze=False)
    for ax, plan in zip(axes[0], fig['plans']):
        W, H = 100, 80
        ax.set_xlim(0, W); ax.set_ylim(0, H); ax.set_aspect('equal'); ax.axis('off')
        ax.add_patch(Rectangle((0.5, 0.5), W - 1, H - 1, fill=False, lw=1.4, ec=INK))
        for road in plan.get('roads', []):
            xs, ys = zip(*road['points'])
            ax.plot(xs, ys, color='#B8C4D6', lw=road.get('width', 9), solid_capstyle='butt', zorder=0)
            if road.get('label'):
                lx, ly = road.get('label_at', road['points'][0])
                ax.text(lx, ly, road['label'], fontsize=7.5, color=MUTED, ha='center', va='center', style='italic', rotation=road.get('rotate', 0))
        for a in plan['areas']:
            colour = {'green': '#DCFCE7', 'water': '#DBEAFE', 'building': '#FFFFFF', 'parking': '#F1F5F9'}.get(a.get('kind', 'building'), '#FFFFFF')
            ax.add_patch(FancyBboxPatch((a['x'], a['y']), a['w'], a['h'], boxstyle='round,pad=0,rounding_size=1', fc=colour, ec=PRIMARY if a.get('kind', 'building') == 'building' else MUTED, lw=1.1))
            letter = len(a['label']) == 1
            ax.text(a['x'] + a['w'] / 2, a['y'] + a['h'] / 2, a['label'] if letter else '\n'.join(textwrap.wrap(a['label'], 14)), ha='center', va='center',
                    fontsize=15 if letter else 8, fontweight='bold' if letter else 'normal', color=PRIMARY if letter else INK)
        ax.annotate('', xy=(W + 3, H - 2), xytext=(W + 3, H - 10), arrowprops=dict(arrowstyle='->', color=INK, lw=1.3), annotation_clip=False)
        ax.text(W + 1.8, H - 14, 'N', fontsize=9, fontweight='bold', color=INK, clip_on=False)
        ax.set_title(plan['title'], fontsize=12, fontweight='bold', color=INK)
    f.suptitle(fig['title'], fontsize=13, fontweight='bold', color=INK, x=0.01, ha='left')
    f.text(0.01, 0.01, fig.get('note', ''), fontsize=8.5, color=MUTED)
    f.tight_layout(rect=(0, 0.04, 1, 0.95)); f.savefig(dest); plt.close(f)
    return dest


def pies(fig, dest):
    """One or more pie charts with the same categories, optionally followed by a small table."""
    plt = _plt()
    charts = fig['charts']
    table = fig.get('table')
    cols = len(charts)
    f = plt.figure(figsize=(4.2 * cols + 0.5, 4.9 + (1.9 if table else 0)), dpi=200)
    gs = f.add_gridspec(2 if table else 1, cols, height_ratios=[4.2, 1.9] if table else [1])
    cats = fig['categories']
    for i, ch in enumerate(charts):
        ax = f.add_subplot(gs[0, i])
        wedges, _t, autot = ax.pie(ch['values'], colors=PALETTE[:len(cats)], startangle=90, counterclock=False,
                                   autopct=lambda p: f'{p:.0f}%', pctdistance=0.72, wedgeprops=dict(edgecolor='white', linewidth=1.5),
                                   textprops=dict(color='white', fontsize=9.5, fontweight='bold'))
        ax.set_title(ch['title'], fontsize=11.5, fontweight='bold', color=INK)
        ax.set_aspect('equal')
    f.legend(wedges, cats, loc='upper center', ncol=min(len(cats), 5), frameon=False, bbox_to_anchor=(0.5, 0.96 if not table else 0.98), fontsize=9.5)
    if table:
        ax = f.add_subplot(gs[1, :]); ax.axis('off')
        t = ax.table(cellText=table['rows'], colLabels=table['columns'], loc='center', cellLoc='center')
        t.auto_set_font_size(False); t.set_fontsize(9.5); t.scale(1, 1.45)
        for (r, c), cell in t.get_celld().items():
            cell.set_edgecolor(LINE)
            if r == 0:
                cell.set_facecolor(WASH); cell.set_text_props(fontweight='bold', color=INK)
        ax.set_title(table['title'], fontsize=11, fontweight='bold', color=INK, loc='left')
    f.suptitle(fig['title'], fontsize=13, fontweight='bold', color=INK, x=0.01, ha='left', y=1.0)
    f.text(0.01, 0.005, fig.get('note', ''), fontsize=8.5, color=MUTED)
    f.tight_layout(rect=(0, 0.03, 1, 0.9)); f.savefig(dest, bbox_inches='tight'); plt.close(f)
    return dest
