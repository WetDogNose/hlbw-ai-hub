#!/bin/bash
# // turbo-all

# This script deletes all but the most recent $KEEP_IMAGES images from Google Container Registry for a specific repository.
# Usage: ./cleanup-gcr.sh [PROJECT_ID] [IMAGE_NAME] [KEEP_IMAGES]

PROJECT_ID=${1:-$(gcloud config get-value project)}
IMAGE_NAME=${2:-"wot-box"}
KEEP_IMAGES=${3:-5}

if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID is not set and could not be inferred from gcloud config."
  exit 1
fi

REPO="gcr.io/$PROJECT_ID/$IMAGE_NAME"
echo "Cleaning up images in $REPO, keeping the latest $KEEP_IMAGES..."

# List all tags and their digests, sorted by creation timestamp (oldest first)
# We use a JSON array because it's easier to parse safely
gcloud container images list-tags $REPO \
  --format="get(digest)" \
  --sort-by="~timestamp" | tail -n +$((KEEP_IMAGES + 1)) > old_images.txt

count=$(wc -l < old_images.txt)
echo "Found $count images to delete."

if [ "$count" -eq 0 ]; then
  echo "No images to delete."
  rm old_images.txt
  exit 0
fi

while read -r digest; do
  if [ -n "$digest" ]; then
    echo "Deleting $REPO@$digest..."
    gcloud container images delete "$REPO@$digest" --force-delete-tags --quiet
  fi
done < old_images.txt

rm old_images.txt
echo "Cleanup complete."
