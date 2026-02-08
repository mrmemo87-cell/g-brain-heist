# Fix corrupted emojis in CambridgeTestsHub.tsx

$filePath = "c:\Users\reigh\OneDrive\Documents\GitHub\g-brain-heist\components\CambridgeTestsHub.tsx"

# Read the file
$content = Get-Content $filePath -Raw -Encoding UTF8

# Apply all replacements
$replacements = @{
    'рџ"–' = '📖'  # Reading
    'рџЋ§' = '🏧'  # Listening
    'вњЌпёЏ' = '✌️'  # Grammar
    'рџ"љ' = '📚'  # Vocabulary
    'вњЏпёЏ' = '✏️'  # Writing
    'рџ§Є' = '🧪'  # Science
    'рџ"ќ' = '📝'  # Default
    'вњ•' = '✕'  # Exit
    'рџ'‹' = '👋'  # Welcome
    'рџ"‹' = '📋'  # All
    'вЏі' = '⏳'  # Pending
    'вњ…' = '✅'  # Completed
    'рџ"­' = '🔭'  # Telescope
    'рџ"'' = '📒'  # Notebook
    'рџЋ‰' = '🎉'  # Party
    'рџ"Ѓ' = '📃'  # Page
    'рџ"„' = '📄'  # Document
    'в–¶пёЏ' = '▶️'  # Play
    'вњ"' = '✓'  # Check
    'вЏ±пёЏ' = '⏱️'  # Timer
    'рџ"'' = '🔒'  # Lock
}

foreach ($key in $replacements.Keys) {
    $content = $content -replace [regex]::Escape($key), $replacements[$key]
}

# Write back
$content | Out-File $filePath -Encoding UTF8 -NoNewline

Write-Host "✅ Fixed all emojis in $filePath" -ForegroundColor Green
Write-Host "Applied $($replacements.Count) replacements" -ForegroundColor Green
