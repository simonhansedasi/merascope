#!/bin/bash
# Downloads all vendor assets at pinned versions.
# Skips download if files are already present — safe to run on every deploy.
# To force a re-download: rm -rf vendor/ && bash fetch_vendor.sh
set -e

VENDOR=vendor

if [ -f "$VENDOR/react.production.min.js" ] && [ -f "$VENDOR/fonts/ibm-plex-sans-400.woff2" ]; then
  echo "Vendor assets already present, skipping download."
  exit 0
fi

mkdir -p "$VENDOR/fonts"

echo "Fetching React 18.3.1..."
curl -fsSL "https://unpkg.com/react@18.3.1/umd/react.production.min.js" -o "$VENDOR/react.production.min.js"
curl -fsSL "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" -o "$VENDOR/react-dom.production.min.js"

echo "Fetching Leaflet 1.9.4..."
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" -o "$VENDOR/leaflet.js"
curl -fsSL "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" -o "$VENDOR/leaflet.css"

echo "Fetching fonts (latin subsets)..."
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
GFONTS_URL="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;600;700&display=swap"

python3 - << 'EOF'
import re, urllib.request, os, sys

ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
url = "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;600;700&display=swap"

req = urllib.request.Request(url, headers={"User-Agent": ua})
css = urllib.request.urlopen(req).read().decode()

blocks = re.split(r'(/\* [^*]+ \*/)', css)
pairs = []
i = 0
while i < len(blocks):
    if blocks[i].startswith('/*'):
        comment = blocks[i].strip('/* ').strip(' */')
        body = blocks[i+1] if i+1 < len(blocks) else ''
        pairs.append((comment.strip(), body))
        i += 2
    else:
        i += 1

out_dir = 'vendor/fonts'
css_rules = []
for comment, body in pairs:
    if comment != 'latin':
        continue
    m_family = re.search(r"font-family: '([^']+)'", body)
    m_weight = re.search(r'font-weight: (\d+)', body)
    m_url    = re.search(r'url\((https://[^\)]+\.woff2)\)', body)
    if not (m_family and m_weight and m_url):
        continue
    family   = m_family.group(1)
    weight   = m_weight.group(1)
    font_url = m_url.group(1)
    filename = f"{family.lower().replace(' ','-')}-{weight}.woff2"
    path = os.path.join(out_dir, filename)
    urllib.request.urlretrieve(font_url, path)
    print(f"  {filename}")
    css_rules.append(f"""@font-face {{
  font-family: '{family}';
  font-style: normal;
  font-weight: {weight};
  font-display: swap;
  src: url('/vendor/fonts/{filename}') format('woff2');
}}""")

with open('vendor/fonts.css', 'w') as f:
    f.write('\n'.join(css_rules) + '\n')
print("  fonts.css")
EOF

echo "Done. vendor/ is ready."
