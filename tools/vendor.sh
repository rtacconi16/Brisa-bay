#!/usr/bin/env bash
# Re-download the locator's vendored map libraries and verify them against the
# hashes pinned below. Run from the repo root:
#
#   ./tools/vendor.sh
#
# These files are served from our own origin so the site does not depend on a
# third-party CDN at runtime. The hashes are what makes re-vendoring safe: if
# upstream ever serves different bytes for the same version, this fails loudly
# instead of silently shipping them.
#
# To upgrade a version: bump it below, run the script, note the FAIL, verify the
# new bytes deliberately, then paste the reported hash in.
set -euo pipefail

DEST="assets/vendor/leaflet"
LEAFLET="1.9.4"
CLUSTER="1.5.3"

mkdir -p "$DEST/images"

fetch() { # url dest expected
  curl -fsSL "$1" -o "$2"
  local actual
  actual="sha384-$(openssl dgst -sha384 -binary "$2" | openssl base64 -A)"
  if [ "$actual" = "$3" ]; then
    printf '  OK    %s\n' "$2"
  else
    printf '  FAIL  %s\n    expected %s\n    actual   %s\n' "$2" "$3" "$actual" >&2
    exit 1
  fi
}

echo "Vendoring Leaflet ${LEAFLET} + markercluster ${CLUSTER}"

fetch "https://unpkg.com/leaflet@${LEAFLET}/dist/leaflet.js" \
      "$DEST/leaflet.js" \
      "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"

fetch "https://unpkg.com/leaflet@${LEAFLET}/dist/leaflet.css" \
      "$DEST/leaflet.css" \
      "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"

fetch "https://unpkg.com/leaflet.markercluster@${CLUSTER}/dist/leaflet.markercluster.js" \
      "$DEST/leaflet.markercluster.js" \
      "sha384-eXVCORTRlv4FUUgS/xmOyr66XBVraen8ATNLMESp92FKXLAMiKkerixTiBvXriZr"

fetch "https://unpkg.com/leaflet.markercluster@${CLUSTER}/dist/MarkerCluster.css" \
      "$DEST/MarkerCluster.css" \
      "sha384-pmjIAcz2bAn0xukfxADbZIb3t8oRT9Sv0rvO+BR5Csr6Dhqq+nZs59P0pPKQJkEV"

# Referenced by leaflet.css. The locator uses divIcons and no layers control, so
# these are never requested in practice — vendored so nothing 404s if that changes.
for img in layers.png layers-2x.png marker-icon.png marker-icon-2x.png marker-shadow.png; do
  curl -fsSL "https://unpkg.com/leaflet@${LEAFLET}/dist/images/${img}" -o "$DEST/images/${img}"
  printf '  OK    %s\n' "$DEST/images/${img}"
done

echo
echo "Done. Bump the ?v= on store-map.js in where-to-buy.html if the libraries changed."
