"""
grade_states.py — compute relative letter grades for all 48 states from real pipeline data.
Run on the Hetzner VPS where supplemental scores (scripts 11-16) are present.

Categories and columns match explorer.jsx _GRADE_CATS exactly (using _nat scores).

Output modes:
  python3 grade_states.py          -> prints summary table + JSON to grades_output.json
  python3 grade_states.py --patch  -> also patches data.js in place
"""

import json
import os
import sys
import re

DATA_DIR   = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
DATA_JS    = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'merascope', 'data.js')
OUT_JSON   = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'grades_output.json')

STATES = [
    'AL','AR','AZ','CA','CO','CT','DE','FL','GA','IA','ID','IL','IN','KS','KY',
    'LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM',
    'NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA',
    'WI','WV','WY'
]

# Matches _GRADE_CATS in explorer.jsx exactly
CATEGORIES = {
    'Water Durability':       ['water_score_nat', 'aquifer_score_nat', 'waterway_score_nat', 'water_stress_score_nat'],
    'Grid Access':            ['tx_score_nat', 'substation_score_nat', 'fiber_score_nat', 'grid_capacity_score_nat'],
    'Hazard Exposure':        ['seismic_score_nat', 'flood_score_nat', 'air_quality_score_nat'],
    'Community Burden':       ['ej_score_nat', 'pop_exposure_score_nat'],
    'Contamination Distance': ['contamination_score_nat', 'superfund_score_nat', 'rcra_score_nat'],
}

def pct_to_grade(rank, n):
    """rank 0 = best. Mirrors _rankToGrade() in explorer.jsx."""
    pct = rank / max(n - 1, 1)
    if pct <= 0.08: return 'A+'
    if pct <= 0.17: return 'A'
    if pct <= 0.25: return 'A-'
    if pct <= 0.33: return 'B+'
    if pct <= 0.42: return 'B'
    if pct <= 0.50: return 'B-'
    if pct <= 0.58: return 'C+'
    if pct <= 0.67: return 'C'
    if pct <= 0.75: return 'C-'
    if pct <= 0.83: return 'D+'
    if pct <= 0.92: return 'D'
    return 'D-'

# ── data loading ──────────────────────────────────────────────────────────────

def load_state(state):
    path = os.path.join(DATA_DIR, state, 'grid_scores.geojson')
    if not os.path.exists(path):
        return None
    with open(path) as f:
        g = json.load(f)
    rows = []
    for feat in g['features']:
        p = feat['properties']
        if p.get('flood_score', 1) == 0:
            continue
        if (p.get('protected_frac') or 0) > 0.25:
            continue
        rows.append(p)
    return rows

def col_mean(rows, col):
    vals = [r[col] for r in rows if r.get(col) is not None]
    return sum(vals) / len(vals) if vals else None

def category_mean(rows, cols):
    vals = []
    for r in rows:
        col_vals = [r[c] for c in cols if r.get(c) is not None]
        if col_vals:
            vals.append(sum(col_vals) / len(col_vals))
    return sum(vals) / len(vals) if vals else None

# ── why-text generators (score-aware, using _nat column means) ────────────────
# _nat values: nationally normalized 0-1 (p01/p99 across all 48 states).
# Thresholds: >=0.65 = strong, <0.35 = weak, else near-median.

def _hi(v):
    return v is not None and v >= 0.65


def _lo(v):
    return v is not None and v < 0.35


def _grade_letter(grade):
    return grade[0] if grade else 'C'


def _is_strong(grade):
    return _grade_letter(grade) in ('A', 'B')


def _is_weak(grade):
    return _grade_letter(grade) in ('D', 'F')

def _fmt_factors(items):
    """Join factor sentences with a space. Capitalizes first char only — preserves acronyms."""
    return ' '.join((i[0].upper() + i[1:]).rstrip('.') + '.' for i in items) if items else ''

def why_water(state, water, aquifer, waterway, stress, grade):
    issues, strengths = [], []

    if _hi(water): strengths.append(f'precipitation availability is strong ({water:.2f})')
    elif _lo(water): issues.append(f'water availability is constrained ({water:.2f}) — paper rights exceed wet-year supply in key corridors')
    elif _is_weak(grade): issues.append(f'water availability sits below the national median ({water:.2f})')

    if aquifer is not None:
        if _hi(aquifer): strengths.append(f'groundwater access is favorable ({aquifer:.2f})')
        elif _lo(aquifer): issues.append(f'aquifer access is limited or heavily drawn ({aquifer:.2f})')

    if waterway is not None:
        if _hi(waterway): strengths.append(f'river and waterway proximity is strong ({waterway:.2f})')
        elif _lo(waterway): issues.append(f'waterway proximity is weak ({waterway:.2f}) — cooling and process water options are limited')

    if stress is not None:
        if _hi(stress): strengths.append(f'long-term supply stress is low ({stress:.2f})')
        elif _lo(stress): issues.append(f'WRI Aqueduct stress score is elevated ({stress:.2f}) — chronic overallocation risk')

    if not issues and not strengths:
        return f'{state} sits near the national median across all water indicators. No single factor is a dominant strength or constraint.'
    if not issues:
        return f'Strong water position. {_fmt_factors(strengths)}'
    if not strengths:
        return f'Water is a primary constraint. {_fmt_factors(issues)}'
    return f'Mixed water picture. Strengths: {_fmt_factors(strengths)} Watch: {_fmt_factors(issues)}'

def why_grid(state, tx, sub, fiber, cap, grade):
    issues, strengths = [], []

    if tx is not None:
        if _hi(tx): strengths.append(f'high-voltage transmission proximity is strong ({tx:.2f})')
        elif _lo(tx): issues.append(f'transmission coverage is thin ({tx:.2f}) — significant new build required in many viable cells')
        elif _is_weak(grade): issues.append(f'transmission proximity sits below the national median ({tx:.2f})')

    if sub is not None:
        if _hi(sub): strengths.append(f'substation density is favorable ({sub:.2f})')
        elif _lo(sub): issues.append(f'substation coverage is sparse ({sub:.2f})')

    if fiber is not None:
        if _hi(fiber): strengths.append(f'fiber interconnect density is strong ({fiber:.2f})')
        elif _lo(fiber): issues.append(f'fiber infrastructure is limited ({fiber:.2f})')

    if cap is None or cap == 0:
        issues.append('ISO queue capacity data is sparse — interconnection risk should be assessed independently')
    elif _hi(cap): strengths.append(f'ISO interconnection queue headroom is favorable ({cap:.2f})')
    elif _lo(cap): issues.append(f'ISO queue is congested ({cap:.2f}) — new large-load additions face above-average wait times')

    if not issues and not strengths:
        return f'{state} sits near the national median on all grid indicators. No single factor dominates.'
    if not issues:
        return f'Strong grid position. {_fmt_factors(strengths)}'
    if not strengths:
        return f'Grid access is a primary constraint. {_fmt_factors(issues)}'
    return f'Mixed grid picture. Strengths: {_fmt_factors(strengths)} Watch: {_fmt_factors(issues)}'

def why_hazard(state, seismic, flood, air, grade):
    issues, strengths = [], []

    if seismic is not None:
        if _hi(seismic): strengths.append(f'seismic risk is low ({seismic:.2f})')
        elif _lo(seismic): issues.append(f'seismic exposure is elevated ({seismic:.2f}) — structural design requirements increase build cost')
        elif _is_weak(grade): issues.append(f'seismic exposure is above the national median ({seismic:.2f}) — structural requirements may apply in some viable cells')

    if flood is not None:
        if _hi(flood): strengths.append(f'flood exposure is minimal across viable cells ({flood:.2f})')
        elif _lo(flood): issues.append(f'residual flood risk is elevated ({flood:.2f}) across meaningful portions of viable cells')

    if air is not None:
        if _hi(air): strengths.append(f'air quality attainment is strong ({air:.2f}) — CAA permitting friction is low')
        elif _lo(air): issues.append(f'NAAQS non-attainment coverage is significant ({air:.2f}) — CAA permitting adds cost and timeline risk')

    if not issues and not strengths:
        return f'{state} sits near the national median on hazard indicators. No single factor is a dominant constraint.'
    if not issues:
        return f'Low hazard profile. {_fmt_factors(strengths)}'
    if not strengths:
        return f'Hazard exposure ranks below most states nationally. {_fmt_factors(issues)}'
    return f'Mixed hazard profile. Strengths: {_fmt_factors(strengths)} Watch: {_fmt_factors(issues)}'

def why_community(state, ej, pop, grade):
    issues, strengths = [], []

    if ej is not None:
        if _hi(ej): strengths.append(f'EJ burden is low across viable cells ({ej:.2f})')
        elif _lo(ej): issues.append(f'EJ burden is high ({ej:.2f}) — cumulative impact analysis will be required by most regulators')
        elif _is_weak(grade): issues.append(f'EJ burden sits above the national median ({ej:.2f}) — community benefit agreements are advisable')

    if pop is not None:
        if _hi(pop): strengths.append(f'population exposure is low ({pop:.2f})')
        elif _lo(pop): issues.append(f'viable cells overlap with denser residential areas ({pop:.2f}) — noise and visual impact reviews likely')

    if not issues and not strengths:
        return f'{state} sits near the national median on community burden indicators.'
    if not issues:
        return f'Low community burden. {_fmt_factors(strengths)} Opposition risk is below average.'
    if not strengths:
        return f'Community burden ranks above most states nationally. {_fmt_factors(issues)}'
    return f'Mixed community burden. Strengths: {_fmt_factors(strengths)} Watch: {_fmt_factors(issues)}'

def why_contamination(state, contam, sf, rcra, grade):
    issues, strengths = [], []

    if contam is not None:
        if _hi(contam): strengths.append(f'TRI contamination buffer is strong ({contam:.2f})')
        elif _lo(contam): issues.append(f'contamination proximity is constrained ({contam:.2f}) — legacy industrial presence affects viable inventory')
        elif _is_weak(grade): issues.append(f'contamination proximity sits below the national median ({contam:.2f})')

    if sf is not None:
        if _hi(sf): strengths.append(f'Superfund NPL clearance is favorable ({sf:.2f})')
        elif _lo(sf): issues.append(f'NPL Superfund proximity is elevated ({sf:.2f}) — Phase I and II ESAs are essential')

    if rcra is not None:
        if _hi(rcra): strengths.append(f'RCRA corrective action site clearance is good ({rcra:.2f})')
        elif _lo(rcra): issues.append(f'RCRA corrective action site density is high ({rcra:.2f}) — legacy hazardous waste handling adds due diligence burden')

    if not issues and not strengths:
        return f'{state} sits near the national median on contamination indicators. Phase I findings are unlikely to be material in most viable cells.'
    if not issues:
        return f'Clean contamination profile. {_fmt_factors(strengths)} Phase I findings are unlikely to be material.'
    if not strengths:
        return f'Contamination is a meaningful constraint. {_fmt_factors(issues)}'
    return f'Mixed contamination profile. Strengths: {_fmt_factors(strengths)} Watch: {_fmt_factors(issues)}'


# ── main ──────────────────────────────────────────────────────────────────────

print('Loading state data...', file=sys.stderr)
state_rows = {}
for st in STATES:
    rows = load_state(st)
    if rows is None or len(rows) < 5:
        print(f'  SKIP {st}: no data', file=sys.stderr)
        continue
    state_rows[st] = rows

print(f'Loaded {len(state_rows)} states.', file=sys.stderr)
print('Computing category means (using _nat columns)...', file=sys.stderr)

IND_COLS = list({c for cols in CATEGORIES.values() for c in cols})

means = {}
for st, rows in state_rows.items():
    means[st] = {col: col_mean(rows, col) for col in IND_COLS}
    for cat, cols in CATEGORIES.items():
        means[st][f'_cat_{cat}'] = category_mean(rows, cols)

print('Ranking states by category (mirrors _rankFeats in explorer.jsx)...', file=sys.stderr)
results = {st: {'cat_rank': {}, 'cat_grade': {}} for st in state_rows}
states_list = list(state_rows.keys())
n = len(states_list)

for cat in CATEGORIES:
    key = f'_cat_{cat}'
    for st in states_list:
        my_score = means[st][key]
        if my_score is None:
            rank = n // 2
        else:
            rank = sum(1 for s2 in states_list if means[s2].get(key) is not None and means[s2][key] > my_score)
        results[st]['cat_rank'][cat]  = rank
        results[st]['cat_grade'][cat] = pct_to_grade(rank, n)

for st in states_list:
    ranks = list(results[st]['cat_rank'].values())
    overall_rank = int(round(sum(ranks) / len(ranks)))
    results[st]['overall_rank']  = overall_rank
    results[st]['overall_grade'] = pct_to_grade(overall_rank, n)

print('Generating why text...', file=sys.stderr)

output = {}
for st in sorted(state_rows.keys()):
    m  = means[st]
    r  = results[st]
    cg = r['cat_grade']
    grades = [
        {'k': 'Water Durability',       'g': cg['Water Durability'],
         'why': why_water(st, m.get('water_score_nat'), m.get('aquifer_score_nat'), m.get('waterway_score_nat'), m.get('water_stress_score_nat'), cg['Water Durability'])},
        {'k': 'Grid Access',            'g': cg['Grid Access'],
         'why': why_grid(st, m.get('tx_score_nat'), m.get('substation_score_nat'), m.get('fiber_score_nat'), m.get('grid_capacity_score_nat'), cg['Grid Access'])},
        {'k': 'Hazard Exposure',        'g': cg['Hazard Exposure'],
         'why': why_hazard(st, m.get('seismic_score_nat'), m.get('flood_score_nat'), m.get('air_quality_score_nat'), cg['Hazard Exposure'])},
        {'k': 'Community Burden',       'g': cg['Community Burden'],
         'why': why_community(st, m.get('ej_score_nat'), m.get('pop_exposure_score_nat'), cg['Community Burden'])},
        {'k': 'Contamination Distance', 'g': cg['Contamination Distance'],
         'why': why_contamination(st, m.get('contamination_score_nat'), m.get('superfund_score_nat'), m.get('rcra_score_nat'), cg['Contamination Distance'])},
    ]
    output[st] = {'overall': r['overall_grade'], 'rank': r['overall_rank'], 'n': n, 'grades': grades}

with open(OUT_JSON, 'w') as f:
    json.dump(output, f, indent=2)
print(f'Wrote {OUT_JSON}', file=sys.stderr)

# ── summary table ─────────────────────────────────────────────────────────────
print(f"\n{'ST':<4} {'Overall':<8} {'Water':<8} {'Grid':<8} {'Hazard':<10} {'Community':<11} {'Contamination'}")
print('-' * 74)
for st in sorted(results.keys(), key=lambda s: results[s]['overall_rank']):
    r  = results[st]
    cg = r['cat_grade']
    print(f"{st:<4} {r['overall_grade']:<8} {cg['Water Durability']:<8} {cg['Grid Access']:<8} {cg['Hazard Exposure']:<10} {cg['Community Burden']:<11} {cg['Contamination Distance']}")

# ── data.js patcher ───────────────────────────────────────────────────────────
if '--patch' not in sys.argv:
    print('\nRun with --patch to apply grades to data.js', file=sys.stderr)
    sys.exit(0)

print('\nPatching data.js...', file=sys.stderr)

with open(DATA_JS, encoding='utf-8') as f:
    src = f.read()

def grades_js(grades_list):
    lines = []
    for g in grades_list:
        why = g['why'].replace("'", "\\'")
        lines.append(f"      {{ k: '{g['k']}', g: '{g['g']}', why: '{why}' }}")
    return '[\n' + ',\n'.join(lines) + '\n    ]'


# patch WA (uses var GRADES / var STATE_GRADE, not mkState)
wa = output.get('WA')
if wa:
    src = re.sub(r"var STATE_GRADE\s*=\s*'[^']*'", f"var STATE_GRADE = '{wa['overall']}'", src)
    new_grades_block = 'var GRADES = [\n'
    for g in wa['grades']:
        why = g['why'].replace("'", "\\'")
        new_grades_block += f"    {{ k: '{g['k']}', g: '{g['g']}', why: '{why}' }},\n"
    new_grades_block += '  ]'
    src = re.sub(r'var GRADES\s*=\s*\[.*?\]', new_grades_block, src, flags=re.DOTALL)
    print(f"  Patched WA: {wa['overall']}", file=sys.stderr)

def find_mkstate_bounds(src, st):
    """Bracket-aware scanner: returns (grade_start, grade_end, array_start, array_end) or None."""
    anchor = f"{st}: mkState('{st}',"
    pos = src.find(anchor)
    if pos == -1:
        return None
    i = pos + len(anchor)
    # skip state name string
    while i < len(src) and src[i] in ' \t\n': i += 1
    if i < len(src) and src[i] == "'":
        i += 1
        while i < len(src) and src[i] != "'": i += 1
        i += 1
    # skip to opening { of config
    while i < len(src) and src[i] != '{': i += 1
    # bracket-count to find config end (string-aware)
    depth = 0; in_str = False; sc = None
    while i < len(src):
        ch = src[i]
        if in_str:
            if ch == '\\': i += 2; continue
            if ch == sc: in_str = False
        else:
            if ch in ("'", '"', '`'): in_str = True; sc = ch
            elif ch == '{': depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0: break
        i += 1
    config_end = i
    # skip to grade string
    i = config_end + 1
    while i < len(src) and src[i] in ' \t\n,': i += 1
    if i >= len(src) or src[i] != "'": return None
    grade_start = i; i += 1
    while i < len(src) and src[i] != "'": i += 1
    grade_end = i + 1
    # skip to grades array
    i = grade_end
    while i < len(src) and src[i] in ' \t\n,': i += 1
    if i >= len(src) or src[i] != '[': return None
    array_start = i
    depth = 0; in_str = False; sc = None
    while i < len(src):
        ch = src[i]
        if in_str:
            if ch == '\\': i += 2; continue
            if ch == sc: in_str = False
        else:
            if ch in ("'", '"', '`'): in_str = True; sc = ch
            elif ch == '[': depth += 1
            elif ch == ']':
                depth -= 1
                if depth == 0: break
        i += 1
    return grade_start, grade_end, array_start, i + 1


patched = 0
for st, data in sorted(output.items()):
    if st == 'WA':
        continue
    bounds = find_mkstate_bounds(src, st)
    if bounds is None:
        continue  # not in data.js; factsheets compute grades dynamically
    grade_start, grade_end, array_start, array_end = bounds
    new_array = grades_js(data['grades'])
    src = src[:array_start] + new_array + src[array_end:]
    src = src[:grade_start] + f"'{data['overall']}'" + src[grade_end:]
    print(f"  Patched {st}: {data['overall']}", file=sys.stderr)
    patched += 1

print(f'  mkState entries patched: {patched}', file=sys.stderr)

with open(DATA_JS, 'w', encoding='utf-8') as f:
    f.write(src)
print('data.js written.', file=sys.stderr)
