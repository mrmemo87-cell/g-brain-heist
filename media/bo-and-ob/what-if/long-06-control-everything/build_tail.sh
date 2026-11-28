#!/usr/bin/env bash
# assemble tail.js from the shared library + this video's scenes and shots
cd "$(dirname "$0")"
cat lib_main.js cat.js thought.js lib_text.js tail_use.js tail_ctl.js tail_shots.js > tail.js
