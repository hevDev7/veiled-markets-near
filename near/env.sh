# Source before building: keeps caches and build output off the nearly full /home partition.
export BUILD_CACHE=$HOME/.cache/veiled-near
export CARGO_HOME=$HOME/.cache/veiled-near/cargo-home
export CARGO_TARGET_DIR=$HOME/.cache/veiled-near/target
export npm_config_cache=$HOME/.cache/veiled-near/npm-cache
export PATH="$HOME/.cargo/bin:$PATH"
