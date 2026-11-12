# Video production skill stack (reference for next time)

Recorded 2026-11-09 from a slide titled "محتاج سكيلز مخصصة" / "استوديو إنتاج متكامل"
(a complete production studio built from eight Claude skills). Use this list the next
time we make YouTube or marketing videos for Brains Heist.

None of these skills are installed in this repository or in the owner's claude.ai skill
library yet. Install them in the video project, not in the Brains Heist app repo, unless a
task explicitly needs them here. All eight are community or vendor skills, so read each
`SKILL.md` before installing and treat the content as untrusted.

## The eight skills on the slide

| # | Slide name | Purpose in the pipeline | Known source |
|---|------------|-------------------------|--------------|
| 01 | youtube agent skill | Channel strategy, SEO, thumbnails, Shorts, analytics | `AgriciDaniel/claude-youtube` (repo-level skill set) |
| 02 | claude youtube | Same toolkit; `/youtube script` writes retention-focused scripts | `AgriciDaniel/claude-youtube` |
| 03 | youtube script writer | Turns an idea, article or transcript into a shoot-ready script with visual cues and pacing | `ailabs-393/ai-labs-claude-skills` (`script-writer`) or `mohitagw15856/pm-claude-skills` (`youtube-script-writer`) |
| 04 | content os | Content calendar / planning layer | No canonical source found yet; search skills.sh for "content os" before use |
| 05 | claude motion | Anthropic's Claude Motion: code-driven animation of text, charts, shapes and images from a prompt (Team/Enterprise beta since Oct 2026). Not a skill file. | Anthropic Help Center, "Get started with Claude Motion" |
| 06 | claude motion design | Motion design principles: timing, easing, choreography | LottieFiles `motion-design` skill (community) |
| 07 | claude remotion skill | Official Remotion best practices for agents writing React video code | `remotion-dev/skills` (`remotion-best-practices`, `remotion-create`) |
| 08 | remotion motion graphics | Remotion-based motion graphics templates (lower thirds, transitions) | Community; check `remotion-dev/skills` first, it may already cover this |

## Install commands

Run from the video project directory (a Remotion project, not this repo):

```bash
# Official Remotion skills (07, likely 08)
npx skills add remotion-dev/skills
# or inside a Remotion project
npx remotion skills add

# Script writer (03)
npx skills add ailabs-393/ai-labs-claude-skills --skill script-writer --agent claude-code

# YouTube toolkit (01, 02): clone and copy skills/claude-youtube into ~/.claude/skills/
git clone https://github.com/AgriciDaniel/claude-youtube

# Verify
npx skills list --agent claude-code
```

## Suggested pipeline order

1. Plan the video in the content calendar (04).
2. Write the script (03), then tighten hooks and retention with the YouTube toolkit (02).
3. Build animated segments with Claude Motion (05) or Remotion (07, 08), applying motion design principles (06).
4. Package titles, thumbnails, tags and Shorts cuts with the YouTube toolkit (01).

## First video built with this stack

`video/bubble-sheet-demo/` holds the animated explainer for the paper assignment and bubble
sheet scanning flow. It is the zero-cost version of the pipeline: Remotion for animation,
Kokoro (offline) for the voice, ffmpeg for the render, and the app's own print code for the
sheet. See its README for how to regenerate or change the narration.

## Connected tools already available in Claude sessions

- The Runway connector exposes video generation, stitching, speech, music and sound effects, and an `import-claude-motion-from-url` tool that pulls a Claude Motion export into Runway for further editing.
- Metricool is connected for scheduling the finished video posts.

## Sources

- Remotion agent skills docs: https://www.remotion.dev/docs/ai/skills and https://github.com/remotion-dev/skills
- claude-youtube README: https://github.com/AgriciDaniel/claude-youtube
- ai-labs script-writer: https://claude-plugins.dev/skills/@ailabs-393/ai-labs-claude-skills/script-writer
- pm-claude-skills youtube-script-writer: https://claudeskills.info/skills/mohitagw15856/pm-claude-skills/youtube-script-writer/
- Claude Motion overview (third-party summary of the Oct 2026 beta): https://www.layer3labs.io/guides/claude-motion
