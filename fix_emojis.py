#!/usr/bin/env python3
"""Fix corrupted emojis in CambridgeTestsHub.tsx"""

# Mapping of corrupted sequences to proper emojis
replacements = {
    'рџ"–': '📖',  # Reading
    'рџЋ§': '🏧',  # Listening
    'вњЌпёЏ': '✌️',  # Grammar
    'рџ"љ': '📚',  # Vocabulary
    'вњЏпёЏ': '✏️',  # Writing
    'рџ§Є': '🧪',  # Science
    'рџ"ќ': '📝',  # Default
    'вњ•': '✕',  # Exit
    'рџ'‹': '👋',  # Welcome
    'рџ"‹': '📋',  # All
    'вЏі': '⏳',  # Pending
    'вњ…': '✅',  # Completed
    'рџ"­': '🔭',  # Telescope
    'рџ"'': '📒',  # Notebook
    'рџЋ‰': '🎉',  # Party
    'рџ"Ѓ': '📃',  # Page
    'рџ"„': '📄',  # Document
    'в–¶пёЏ': '▶️',  # Play
    'вњ"': '✓',  # Check
    'вЏ±пёЏ': '⏱️',  # Timer
    'рџ"'': '🔒',  # Lock
}

file_path = r'c:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist\components\CambridgeTestsHub.tsx'

# Read the file
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Apply all replacements
for old, new in replacements.items():
    content = content.replace(old, new)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"✅ Fixed all emojis in {file_path}")
print(f"Applied {len(replacements)} replacements")
