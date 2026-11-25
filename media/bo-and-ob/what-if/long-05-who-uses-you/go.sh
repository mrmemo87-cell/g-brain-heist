#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
node /home/user/g-brain-heist/media/bo-and-ob/tools/build.mjs
node gen.mjs
node render.mjs frames 4 2>&1 | grep -vE "^\s+at " | tail -2
ffmpeg -y -v error -framerate 30 -i frames/%05d.jpg -i mix.wav -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart -shortest what-if-who-uses-you.mp4
ffprobe -v error -show_entries format=duration,size -of csv=p=0 what-if-who-uses-you.mp4
ffmpeg -hide_banner -i what-if-who-uses-you.mp4 -af volumedetect -vn -f null - 2>&1 | grep -E "mean_vol|max_vol"
node cutshorts.mjs
node /home/user/g-brain-heist/media/bo-and-ob/tools/thumb.mjs | tail -1
echo ALLDONE
