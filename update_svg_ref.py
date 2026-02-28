"""Update SVG references in the test file."""
import re

TEST_FILE = r"public\cambridge-tests\Biology\cell_structure.html"

with open(TEST_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Find and replace the question 2 prompt (9700_s20_qp_11 Q: 1)
# Use regex to handle special characters

pattern = r"(code: '9700_s20_qp_11 Q: 1',)\s*prompt:\s*'[^']*Which statement about the type of cell shown in the photomicrograph is correct\?',"

replacement = r"\1\n        prompt: '<img src=\"svg/ch1/9700_s20_qp_11_Q_1.svg\" alt=\"Question 2 Cell Structure\" style=\"max-width:100%;border:1px solid #ddd;border-radius:8px;margin:8px 0;\" /><br><br>Which statement about the type of cell shown in the photomicrograph is correct?',"

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

if new_content != content:
    with open(TEST_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("✓ Successfully updated question 2 with SVG reference")
    print(f"  Replaced prompt to use: svg/ch1/9700_s20_qp_11_Q_1.svg")
else:
    print("✗ No changes made - pattern not found")
    print("\nSearching for question 2 to debug...")
    if "9700_s20_qp_11 Q: 1" in content:
        print("  Found code: 9700_s20_qp_11 Q: 1")
        # Find the line
        for i, line in enumerate(content.split('\n')):
            if '9700_s20_qp_11 Q: 1' in line:
                print(f"  Line {i}: {line[:80]}")
