#!/usr/bin/env python3
"""
Compile all vocab/*.yaml files into vocab/compiled.json for the Swift app.
Run after editing any vocab file: python3 vocab/compile_vocab.py
Requires: pip install pyyaml
"""
import json, sys, pathlib
try:
    import yaml
except ImportError:
    sys.exit("pyyaml not found — run: pip install pyyaml")

VOCAB_DIR = pathlib.Path(__file__).parent
OUTPUT    = VOCAB_DIR / "compiled.json"

entries = []
for yaml_file in sorted(VOCAB_DIR.glob("*.yaml")):
    with open(yaml_file) as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        continue
    for category, items in data.items():
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict) or "spoken" not in item:
                continue
            entry = {
                "spoken": item["spoken"],
                "source": yaml_file.stem,
                "category": category,
                "spaceBefore": item.get("space_before", True),
                "spaceAfter":  item.get("space_after",  True),
            }
            if "written" in item:
                entry["written"] = item["written"]
            if "action" in item:
                entry["action"] = item["action"]
            if "param" in item:
                entry["param"] = item["param"]
            entries.append(entry)

OUTPUT.write_text(json.dumps({"entries": entries}, indent=2))
print(f"Compiled {len(entries)} entries → {OUTPUT}")
