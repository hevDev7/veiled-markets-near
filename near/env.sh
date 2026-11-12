# Source before building. Cargo's and npm's caches and the build output go under BUILD_CACHE
# (default ~/.cache/veiled-near). Machine-specific settings, such as BUILD_CACHE on another disk or
# NEAR_SANDBOX_BIN_PATH, belong in near/env.local.sh (gitignored), which this file sources first.
_veiled_near_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [ -f "$_veiled_near_dir/env.local.sh" ]; then
  . "$_veiled_near_dir/env.local.sh"
fi
unset _veiled_near_dir
export BUILD_CACHE="${BUILD_CACHE:-$HOME/.cache/veiled-near}"
export CARGO_HOME="$BUILD_CACHE/cargo-home"
export CARGO_TARGET_DIR="$BUILD_CACHE/target"
export npm_config_cache="$BUILD_CACHE/npm-cache"
export PATH="$HOME/.cargo/bin:$PATH"
