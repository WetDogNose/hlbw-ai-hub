# // turbo-all

param(
    [string]$CommitMessage = "checkpoint"
)

git add .
git commit -m $CommitMessage