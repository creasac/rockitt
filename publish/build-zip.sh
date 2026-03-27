#!/usr/bin/env bash

set -euo pipefail

cd ~/projects/rockitt
npm run build
rm -f .output/rockitt-0.1.0-chrome.zip
cd .output/chrome-mv3
zip -r ../rockitt-0.1.0-chrome.zip .
