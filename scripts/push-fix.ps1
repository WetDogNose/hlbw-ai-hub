# // turbo-all
Write-Output "Creating public directory..."
New-Item -ItemType Directory -Force -Path public | Out-Null
New-Item -ItemType File -Force -Path public\.gitkeep | Out-Null
Write-Output "Committing to git..."
git add public\.gitkeep
git commit -m "fix(build): add public directory to fix Docker deployment"
Write-Output "Pushing to remote..."
git push
Write-Output "Done. Cloud Build should trigger automatically."
