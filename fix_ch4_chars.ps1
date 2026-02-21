# Fix broken characters in AS Chemistry Ch4 (States of matter)
# PowerShell 5.1 compatible version

$ErrorActionPreference = 'Stop'

# Unicode character constants
$fffd = [char]0xFFFD      # replacement character (broken)
$deg  = [char]0x00B0      # degree sign
$endash = [char]0x2013    # en-dash
$times = [char]0x00D7     # multiplication sign
$minus = [char]0x2212     # minus sign

# ---- File 1: cambridgeQuestionData.ts ----
$tsFile = Join-Path $PSScriptRoot "components\cambridgeQuestionData.ts"
$ts = [System.IO.File]::ReadAllText($tsFile, [System.Text.Encoding]::UTF8)

$ch4Start = $ts.IndexOf('"AS Chemistry Ch4 (States of matter)"')
if ($ch4Start -lt 0) { throw "Ch4 section not found in TS file" }
$ch4End = $ts.IndexOf("`n};", $ch4Start)
if ($ch4End -lt 0) { $ch4End = $ts.Length }

Write-Host "TS Ch4: chars $ch4Start to $ch4End"

$before = $ts.Substring(0, $ch4Start)
$ch4 = $ts.Substring($ch4Start, $ch4End - $ch4Start)
$after = $ts.Substring($ch4End)

$fffdCount = [regex]::Matches($ch4, [regex]::Escape("$fffd")).Count
Write-Host "FFFD in Ch4 before: $fffdCount"

# 1) degree: digit space FFFD C
$degC = "${deg}C"
$ch4 = [regex]::Replace($ch4, "(\d) ${fffd}C\b", "`$1 $degC")
$ch4 = $ch4.Replace("/ ${fffd}C", "/ ${deg}C")

# 2) bond notation
$ch4 = $ch4.Replace("C${fffd}F", "C${endash}F")
$ch4 = $ch4.Replace("N${fffd}H", "N${endash}H")
$ch4 = $ch4.Replace("P${fffd}H", "P${endash}H")

# 3) apostrophe
$ch4 = $ch4.Replace("Waals${fffd}", "Waals'")

# 4) smart quotes
$ch4 = $ch4.Replace("${fffd}It is lighter", "'It is lighter")
$ch4 = $ch4.Replace("copper.${fffd}", "copper.'")

# 5) multiplication before scientific notation
$ch4 = [regex]::Replace($ch4, '(\d) \? 10<sup>', "`$1 $times 10<sup>")

# 6) minus in negative exponents
$ch4 = [regex]::Replace($ch4, '<sup>\?(\d)', "<sup>$minus`$1")

# 7) multiplication in fractions
$ch4 = [regex]::Replace($ch4, '(\d) \? (\d)', "`$1 $times `$2")

$fffdAfter = [regex]::Matches($ch4, [regex]::Escape("$fffd")).Count
Write-Host "FFFD in Ch4 after: $fffdAfter"

if ($fffdAfter -gt 0) {
    $si = 0
    while (($si = $ch4.IndexOf($fffd, $si)) -ge 0) {
        $s = [Math]::Max(0, $si - 30)
        $e = [Math]::Min($ch4.Length, $si + 30)
        Write-Host "  at $si : $($ch4.Substring($s, $e - $s).Replace("`n",' '))"
        $si++
    }
}

$ts = $before + $ch4 + $after
[System.IO.File]::WriteAllText($tsFile, $ts, (New-Object System.Text.UTF8Encoding $true))
Write-Host "TS file saved."

# ---- File 2: states_of_matter.html ----
$htmlFile = Join-Path $PSScriptRoot "public\cambridge-tests\Chemistry\states_of_matter.html"
$html = [System.IO.File]::ReadAllText($htmlFile, [System.Text.Encoding]::UTF8)

$hBefore = [regex]::Matches($html, [regex]::Escape("$fffd")).Count
Write-Host "`nHTML FFFD before: $hBefore"

$html = [regex]::Replace($html, "(\d) ${fffd}C\b", "`$1 $degC")
$html = $html.Replace("/ ${fffd}C", "/ ${deg}C")
$html = $html.Replace("C${fffd}F", "C${endash}F")
$html = $html.Replace("N${fffd}H", "N${endash}H")
$html = $html.Replace("P${fffd}H", "P${endash}H")
$html = $html.Replace("Waals${fffd}", "Waals'")
$html = $html.Replace("${fffd}It is lighter", "'It is lighter")
$html = $html.Replace("copper.${fffd}", "copper.'")
$html = $html.Replace("4 ${fffd} 61", "4 ${endash} 61")
$html = $html.Replace("(A${fffd}D)", "(A${endash}D)")
$html = $html.Replace("${fffd}I understand${fffd}", "'I understand'")

# Generic: remaining FFFD between words -> en-dash
$html = [regex]::Replace($html, " ${fffd} ", " ${endash} ")

$html = [regex]::Replace($html, '(\d) \? 10<sup>', "`$1 $times 10<sup>")
$html = [regex]::Replace($html, '<sup>\?(\d)', "<sup>$minus`$1")
$html = [regex]::Replace($html, '(\d) \? (\d)', "`$1 $times `$2")

$hAfter = [regex]::Matches($html, [regex]::Escape("$fffd")).Count
Write-Host "HTML FFFD after: $hAfter"

if ($hAfter -gt 0) {
    $si = 0; $ct = 0
    while (($si = $html.IndexOf($fffd, $si)) -ge 0 -and $ct -lt 15) {
        $s = [Math]::Max(0, $si - 40)
        $e = [Math]::Min($html.Length, $si + 40)
        Write-Host "  at $si : $($html.Substring($s, $e - $s).Replace("`n",' '))"
        $si++; $ct++
    }
}

[System.IO.File]::WriteAllText($htmlFile, $html, (New-Object System.Text.UTF8Encoding $true))
Write-Host "HTML file saved."
Write-Host "Done!"
