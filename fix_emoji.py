import sys

file_path = r'c:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist\components\CambridgeTestsHub.tsx'

# Read file with UTF-8 encoding
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace corrupted emoji sequences with proper ones
replacements = {
    'рџ"Ѓ': '📃',
    'в–ё': '▸',
    'в–ѕ': '▾',
    'рџЋ§': '🏧',
    'вЏі': '⏳',
    'рџљЂ': '🚀',
    'рџ"‹': '📋',
    'рџ"€': '📊',
    'вњЏпёЏ': '✏️',
    'рџ'¬': '💬',
    'вњЁ': '✨',
    'рџ"ќ': '📝'
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Write back with UTF-8 without BOM
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Fixed all emoji encoding issues")
