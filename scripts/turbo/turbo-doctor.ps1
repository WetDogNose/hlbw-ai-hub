# // turbo-all

param(
    [string[]]$ArgsWrapper
)

# Pass all arguments directly to the node script
node scripts/toolchain-doctor.js @ArgsWrapper