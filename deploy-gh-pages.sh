#!/bin/bash
set -e

echo "==> Building frontend for GitHub Pages..."
GITHUB_PAGES=true npx vite build

echo "==> Deploying to gh-pages branch..."
npx gh-pages -d dist/public -b gh-pages

echo ""
echo "Done! Visit https://Yxz233333.github.io/sanjiaozhou/ in a few minutes."
