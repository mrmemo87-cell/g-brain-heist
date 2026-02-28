"""Find and update SVG references in the test."""
import re
from pathlib import Path

TEST_FILE = r"public\cambridge-tests\Biology\cell_structure.html"
SVG_DIR = r"public\cambridge-tests\Biology\svg\ch1"

# Find all SVG files
svg_path = Path(SVG_DIR)
svg_files = list(svg_path.glob("*.svg"))

print(f"Found {len(svg_files)} SVG files:\n")
for svg in sorted(svg_files):
    print(f"  - {svg.name}")

# Read test file
with open(TEST_FILE, 'r') as f:
    content = f.read()

# Find questions that match SVG filenames
print(f"\n\nMatching SVGs to questions:\n")

for svg in sorted(svg_files):
    # Convert filename 9700_m20_qp_11_Q_1.svg to question code 9700_m20_qp_11 Q: 1
    filename = svg.stem  # Remove .svg
    code = filename.replace('_Q_', ' Q: ')
    
    # Find this question in the test
    pattern = rf"code:\s*['\"]({re.escape(code)})['\"]"
    match = re.search(pattern, content)
    
    if match:
        print(f"  ✓ {code}")
        print(f"    SVG: {svg.name}")
        print(f"    Status: Found in test")
    else:
        print(f"  ✗ {code}")
        print(f"    SVG: {svg.name}")
        print(f"    Status: NOT found in test")
    print()
