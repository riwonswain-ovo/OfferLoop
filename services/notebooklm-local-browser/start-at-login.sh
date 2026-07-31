#!/bin/zsh

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

/opt/homebrew/bin/colima start \
  --cpu 4 \
  --memory 6 \
  --disk 30 \
  --vm-type vz \
  --mount-type virtiofs

cd "${HOME}/Library/Application Support/OfferLoop/notebooklm-browser"
/opt/homebrew/bin/docker context use colima
/opt/homebrew/bin/docker-compose -p notebooklm-local-browser up -d
