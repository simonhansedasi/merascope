"""Tests for scripts/config.py — state table completeness, FIPS codes, bboxes, UTM zones."""
import pytest
from config import STATES, get_state, utm_epsg

CONTIGUOUS_48 = {
    "AL", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "ID",
    "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI",
    "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
    "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
    "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
}

# Authoritative Census FIPS codes (Title 13 USC §141, via Census Bureau)
AUTHORITATIVE_FIPS = {
    "AL": "01", "AZ": "04", "AR": "05", "CA": "06", "CO": "08",
    "CT": "09", "DE": "10", "FL": "12", "GA": "13", "ID": "16",
    "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21",
    "LA": "22", "ME": "23", "MD": "24", "MA": "25", "MI": "26",
    "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31",
    "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36",
    "NC": "37", "ND": "38", "OH": "39", "OK": "40", "OR": "41",
    "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47",
    "TX": "48", "UT": "49", "VT": "50", "VA": "51", "WA": "53",
    "WV": "54", "WI": "55", "WY": "56",
}

# Expected UTM zones for a sample of states (manually computed from center longitude)
# zone = int((center_lon + 180) / 6) + 1;  EPSG = 32600 + zone
KNOWN_UTM = {
    "WA": "EPSG:32610",  # center ≈ -120.8°, zone 10
    "OR": "EPSG:32610",  # center ≈ -120.5°, zone 10
    "CA": "EPSG:32611",  # center ≈ -119.3°, zone 11
    "TX": "EPSG:32614",  # center ≈ -100.1°, zone 14
    "ND": "EPSG:32614",  # center ≈ -100.3°, zone 14
    "FL": "EPSG:32617",  # center ≈ -83.8°,  zone 17
    "PA": "EPSG:32618",  # center ≈ -77.6°,  zone 18
    "ME": "EPSG:32619",  # center ≈ -69.0°,  zone 19
}


class TestStateTable:
    def test_all_48_contiguous_states_present(self):
        missing = CONTIGUOUS_48 - set(STATES)
        assert not missing, f"States missing from config: {sorted(missing)}"

    def test_fips_codes_match_census(self):
        errors = []
        for abbr, expected in AUTHORITATIVE_FIPS.items():
            actual = STATES[abbr]["fips"]
            if actual != expected:
                errors.append(f"{abbr}: got '{actual}', expected '{expected}'")
        assert not errors, "FIPS mismatches:\n" + "\n".join(errors)

    def test_fips_codes_unique_across_48(self):
        fips = [STATES[s]["fips"] for s in CONTIGUOUS_48]
        seen, dupes = set(), set()
        for f in fips:
            (dupes if f in seen else seen).add(f)
        assert not dupes, f"Duplicate FIPS codes: {dupes}"

    def test_fips_codes_are_zero_padded_two_digits(self):
        errors = [
            f"{abbr}: '{STATES[abbr]['fips']}'"
            for abbr in CONTIGUOUS_48
            if not (len(STATES[abbr]["fips"]) == 2 and STATES[abbr]["fips"].isdigit())
        ]
        assert not errors, "Malformed FIPS (must be 2-digit string):\n" + "\n".join(errors)

    def test_bboxes_valid_orientation(self):
        errors = []
        for abbr in CONTIGUOUS_48:
            w, s, e, n = STATES[abbr]["bbox"]
            if w >= e:
                errors.append(f"{abbr}: west({w}) >= east({e})")
            if s >= n:
                errors.append(f"{abbr}: south({s}) >= north({n})")
        assert not errors, "Bbox orientation errors:\n" + "\n".join(errors)

    def test_bboxes_within_conus_bounds(self):
        # Contiguous US: roughly lon [-130, -65], lat [24, 50]
        errors = []
        for abbr in CONTIGUOUS_48:
            w, s, e, n = STATES[abbr]["bbox"]
            if w < -130 or e > -65:
                errors.append(f"{abbr}: longitude {w}..{e} outside CONUS range")
            if s < 24 or n > 50:
                errors.append(f"{abbr}: latitude {s}..{n} outside CONUS range")
        assert not errors, "Bbox out of CONUS:\n" + "\n".join(errors)

    def test_bbox_extents_plausible(self):
        errors = []
        for abbr in CONTIGUOUS_48:
            w, s, e, n = STATES[abbr]["bbox"]
            width, height = e - w, n - s
            if width < 0.5 or width > 30:
                errors.append(f"{abbr}: width {width:.2f}° implausible")
            if height < 0.5 or height > 15:
                errors.append(f"{abbr}: height {height:.2f}° implausible")
        assert not errors, "Bbox size errors:\n" + "\n".join(errors)


class TestGetState:
    def test_returns_all_required_fields(self):
        cfg = get_state("WA")
        for field in ("name", "fips", "bbox", "abbr", "utm_epsg", "bbox_str"):
            assert field in cfg, f"get_state('WA') missing field: '{field}'"

    def test_abbr_normalized_to_uppercase(self):
        assert get_state("wa")["abbr"] == "WA"
        assert get_state("Wa")["abbr"] == "WA"

    def test_bbox_str_is_four_floats_west_south_east_north(self):
        cfg = get_state("OR")
        parts = cfg["bbox_str"].split(",")
        assert len(parts) == 4, f"bbox_str should have 4 parts, got {len(parts)}"
        w, s, e, n = [float(p) for p in parts]
        assert w < e and s < n

    def test_bbox_str_matches_bbox_tuple(self):
        cfg = get_state("TX")
        expected = "{},{},{},{}".format(*cfg["bbox"])
        assert cfg["bbox_str"] == expected

    def test_utm_epsg_added(self):
        cfg = get_state("FL")
        assert cfg["utm_epsg"].startswith("EPSG:326")

    def test_unknown_state_raises_value_error(self):
        with pytest.raises(ValueError, match="Unknown state"):
            get_state("ZZ")

    def test_dict_is_copy_not_reference(self):
        """Mutating the returned dict must not corrupt the STATES table."""
        cfg = get_state("WA")
        original_fips = STATES["WA"]["fips"]
        cfg["fips"] = "99"
        assert STATES["WA"]["fips"] == original_fips


class TestUTMEpsg:
    def test_known_states(self):
        errors = []
        for abbr, expected in KNOWN_UTM.items():
            result = utm_epsg(STATES[abbr]["bbox"])
            if result != expected:
                errors.append(f"{abbr}: got {result}, expected {expected}")
        assert not errors, "\n".join(errors)

    def test_all_48_produce_northern_hemisphere_zone(self):
        errors = []
        for abbr in CONTIGUOUS_48:
            epsg = utm_epsg(STATES[abbr]["bbox"])
            if not epsg.startswith("EPSG:326"):
                errors.append(f"{abbr}: {epsg} not northern UTM (expected EPSG:326xx)")
                continue
            zone = int(epsg.split(":")[1])  # e.g. "EPSG:32610" → 32610
            if not (32601 <= zone <= 32660):
                errors.append(f"{abbr}: full zone code {zone} out of northern UTM range 32601-32660")
        assert not errors, "\n".join(errors)

    def test_zone_increases_eastward(self):
        """UTM zone numbers increase west to east: OR (zone 10) < PA (zone 18)."""
        or_zone = int(utm_epsg(STATES["OR"]["bbox"])[8:])
        pa_zone = int(utm_epsg(STATES["PA"]["bbox"])[8:])
        assert or_zone < pa_zone, f"OR zone {or_zone} should be < PA zone {pa_zone}"

    def test_symmetric_bbox_uses_center(self):
        """A bbox centered on -90° should give zone 16 (int((90)/6)+1 = 16)."""
        bbox = (-91.0, 40.0, -89.0, 42.0)
        epsg = utm_epsg(bbox)
        assert epsg == "EPSG:32616"
