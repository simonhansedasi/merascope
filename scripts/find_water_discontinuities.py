"""Prospecting tool: find ZCTAs where water stress flips extreme<->low across a
short distance. Rare nationally (~1.4%), so a hit near a known data center cluster
is a candidate finding. Basis for outreach/stiffler_water_tip.md.

Caveat: Aqueduct assigns by watershed, so every discontinuity IS a watershed
boundary -- that part is mechanical. What makes a hit interesting is gap size,
proximity to a facility cluster, and whether regulators independently flagged it.
"""
import glob
import json

import numpy as np
from scipy.spatial import cKDTree

BASE = '/home/simonhans/coding/merascope/data'

zc, st, bws, lat, lon = [], [], [], [], []
seen = set()
for path in sorted(glob.glob(f'{BASE}/*/zcta/grid_scores.geojson')):
    state = path.split('/')[-3]
    for f in json.load(open(path))['features']:
        p = f['properties']
        z = p.get('zcta')
        if z in seen or p.get('water_stress_raw') is None:
            continue
        g = f['geometry']
        cs = g['coordinates']
        # crude centroid: mean of all coordinate pairs
        pts = []
        stack = [cs]
        while stack:
            x = stack.pop()
            if isinstance(x[0], (int, float)):
                pts.append(x[:2])
            else:
                stack.extend(x)
        pts = np.array(pts, float)
        seen.add(z)
        zc.append(z); st.append(state); bws.append(p['water_stress_raw'])
        lon.append(pts[:, 0].mean()); lat.append(pts[:, 1].mean())

zc = np.array(zc); st = np.array(st); bws = np.array(bws, float)
lat = np.array(lat); lon = np.array(lon)
print('ZCTAs with centroid + bws:', len(zc))

# project to km-ish for neighbor search
x = lon * 111.0 * np.cos(np.radians(lat.mean()))
y = lat * 111.0
tree = cKDTree(np.c_[x, y])

K = 7
d, idx = tree.query(np.c_[x, y], k=K + 1)
nb = idx[:, 1:]          # drop self
nbd = d[:, 1:]

EXTREME, LOW = 4.0, 1.0
# a "flip": this ZCTA is extreme, and a neighbor within 40km is low (or vice versa)
gap = np.abs(bws[nb] - bws[:, None])
close = nbd <= 40.0
flip = ((bws[:, None] >= EXTREME) & (bws[nb] <= LOW) & close).any(axis=1)
flip |= ((bws[:, None] <= LOW) & (bws[nb] >= EXTREME) & close).any(axis=1)

print(f'\nZCTAs on an extreme/low boundary within 40km: {int(flip.sum())} '
      f'({100*flip.mean():.1f}% of national)')
maxgap = (gap * close).max(axis=1)
print(f'median max-gap to a neighbor within 40km: {np.median(maxgap):.2f} (0-5 scale)')
print(f'share with max-gap > 4.0: {100*np.mean(maxgap > 4.0):.1f}%')

print('\nPer-state count of boundary ZCTAs (top 15):')
rows = sorted({s: int(flip[st == s].sum()) for s in set(st)}.items(),
              key=lambda kv: -kv[1])
for s, n in rows[:15]:
    tot = int((st == s).sum())
    print(f'  {s}: {n:4d} of {tot:5d}  ({100*n/tot:4.1f}%)')

print('\nOregon boundary ZCTAs (the Umatilla case should appear):')
m = flip & (st == 'OR')
for i in np.where(m)[0]:
    j = nb[i][np.argmax(gap[i] * close[i])]
    print(f'  {zc[i]} bws={bws[i]:.2f}  <->  {zc[j]} bws={bws[j]:.2f}  '
          f'({nbd[i][np.argmax(gap[i]*close[i])]:.0f} km)')
