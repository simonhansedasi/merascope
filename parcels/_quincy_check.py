import requests
from collections import Counter

URL = "https://services2.arcgis.com/hQZvdtFxRzJpMtdS/arcgis/rest/services/Parcels/FeatureServer/0/query"
r = requests.get(URL, params={
    "where": "IncorporatedCity='QUINCY'",
    "outFields": "PARCEL,TotalAcres,DepartmentOfRevenueCode,IsExempt",
    "returnGeometry": "false",
    "f": "json",
    "resultRecordCount": "500",
}, timeout=30)
feats = r.json().get("features", [])
acres = [(f["attributes"]["TotalAcres"] or 0) for f in feats]
exempt = sum(1 for f in feats if str(f["attributes"].get("IsExempt", "")).upper() == "TRUE")
dor = Counter(
    str(f["attributes"].get("DepartmentOfRevenueCode", "") or "").strip().split(" ")[0]
    for f in feats
)
print("Quincy parcels sampled:", len(feats))
print("Under 5 ac:", sum(1 for a in acres if a < 5))
print("5+ ac:", sum(1 for a in acres if a >= 5))
print("Exempt:", exempt)
print("DOR top codes:", dict(dor.most_common(8)))
print("Acre range: %.2f - %.2f" % (min(acres), max(acres)))
