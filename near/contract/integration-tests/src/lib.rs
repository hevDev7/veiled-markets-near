//! near-workspaces harness for the Veiled contract's sandbox tests.
//! Build the wasm first: `cd contracts/veiled && cargo near build non-reproducible-wasm --no-abi`
//! (with `near/env.sh` sourced, so the wasm lands in $CARGO_TARGET_DIR/near/veiled/).

use anyhow::{bail, Context, Result};
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

pub const YOCTO_PER_MICRO: u128 = 1_000_000_000_000_000_000;

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub root: Account,
    pub veiled: Contract,
    pub alice: Account,
    pub bob: Account,
    pub carol: Account,
    pub relayer: Account,
    pub oracle: Account,
    pub committee: Vec<Account>,
}

fn wasm(name: &str, env_override: &str) -> Result<Vec<u8>> {
    let path = std::env::var(env_override).unwrap_or_else(|_| {
        let target = std::env::var("CARGO_TARGET_DIR").unwrap_or_else(|_| "../target".to_string());
        format!("{target}/near/{name}/{name}.wasm")
    });
    std::fs::read(&path).with_context(|| format!("cannot read {path}; build it with cargo near first"))
}

pub fn veiled_wasm() -> Result<Vec<u8>> {
    wasm("veiled", "VEILED_WASM")
}

pub fn mock_ft_wasm() -> Result<Vec<u8>> {
    wasm("mock_ft", "MOCK_FT_WASM")
}

pub fn mock_pyth_wasm() -> Result<Vec<u8>> {
    wasm("mock_pyth", "MOCK_PYTH_WASM")
}

pub async fn account(root: &Account, name: &str, near: u128) -> Result<Account> {
    Ok(root.create_subaccount(name).initial_balance(NearToken::from_near(near)).transact().await?.into_result()?)
}

/// Sandbox with the contract deployed as `veiled.test.near` and initialised with `config` (None = Aleo defaults).
pub async fn setup(config: Option<Value>) -> Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let veiled_account = account(&root, "veiled", 100).await?;
    let veiled = veiled_account.deploy(&veiled_wasm()?).await?.into_result()?;
    let alice = account(&root, "alice", 1000).await?;
    let bob = account(&root, "bob", 100).await?;
    let carol = account(&root, "carol", 100).await?;
    let relayer = account(&root, "relayer", 100).await?;
    let oracle = account(&root, "oracle", 1000).await?;
    let mut committee = Vec::new();
    for i in 1..=5 {
        committee.push(account(&root, &format!("c{i}"), 100).await?);
    }
    let ids: Vec<_> = committee.iter().map(|a| a.id().to_string()).collect();
    let init = veiled
        .call("new")
        .args_json(json!({
            "owner": root.id(),
            "oracle_operator": oracle.id(),
            "committee": ids,
            "usdcx_token": "usdcx.test.near",
            "usad_token": "usad.test.near",
            "config": config,
        }))
        .max_gas()
        .transact()
        .await?;
    println!("init gas: {:.1} TGas", tgas(&init));
    init.into_result()?;
    Ok(Env { worker, root, veiled, alice, bob, carol, relayer, oracle, committee })
}

pub fn fixture(name: &str) -> Value {
    let path = format!("{}/fixtures/{name}.json", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("missing {path}: run near/circuits/scripts"));
    serde_json::from_str(&text).unwrap()
}

/// The relayer submits a private action.
pub async fn relay(env: &Env, t: &Value) -> Result<ExecutionFinalResult> {
    Ok(env
        .relayer
        .call(env.veiled.id(), "transact")
        .args_json(json!({ "proof": t["proof"], "public": t["public"], "ext_data": t["ext_data"] }))
        .max_gas()
        .transact()
        .await?)
}

pub fn assert_fails_with(r: &ExecutionFinalResult, code: &str) {
    assert!(r.is_failure(), "expected {code}, but the call succeeded");
    let text = format!("{:?}", r.failures());
    assert!(text.contains(code), "expected {code}, got {text}");
}

pub fn tgas(r: &ExecutionFinalResult) -> f64 {
    r.total_gas_burnt.as_gas() as f64 / 1e12
}

// ------------------------------------------------------------------ live proving (near/circuits/scripts/prove-cli.mjs)

/// Runs the Node prove CLI with one JSON request.
pub fn cli(req: &Value) -> Value {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let script = concat!(env!("CARGO_MANIFEST_DIR"), "/../../circuits/scripts/prove-cli.mjs");
    let mut child = Command::new("node")
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("node must be on PATH");
    child.stdin.take().unwrap().write_all(req.to_string().as_bytes()).unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(out.status.success(), "prove-cli failed for {req}");
    serde_json::from_slice(&out.stdout).unwrap()
}

/// A note this test wallet owns (blinding is the secret that, with sk, opens it).
#[derive(Clone, Debug)]
pub struct Note {
    pub kind: u8,
    pub asset: u64,
    pub sub: u8,
    pub amount: u128,
    pub blinding: u64,
    pub index: u64,
}

pub struct Spend {
    pub result: ExecutionFinalResult,
    pub change: Option<Note>,
    pub minted: Option<Note>,
}

pub struct Wallet {
    pub sk: String,
    next: u64,
}

pub fn s<T: ToString>(x: T) -> String {
    x.to_string()
}

impl Wallet {
    pub fn new(sk: &str) -> Self {
        Self { sk: sk.to_string(), next: 1000 }
    }

    pub fn fresh(&mut self) -> u64 {
        self.next += 1;
        self.next
    }

    pub fn owner_blind(&self, blinding: u64) -> String {
        let r = cli(&json!({ "op": "owner_blinds", "sk": self.sk, "blindings": [s(blinding)] }));
        r["owner_blinds"][0].as_str().unwrap().to_string()
    }

    /// Public NEAR deposit by `from` into a fresh balance note.
    pub async fn deposit(&mut self, env: &Env, from: &Account, micro: u128) -> Result<Note> {
        let blinding = self.fresh();
        let r = from
            .call(env.veiled.id(), "deposit_near")
            .args_json(json!({ "owner_blind": self.owner_blind(blinding), "memo": "" }))
            .deposit(NearToken::from_yoctonear(micro * YOCTO_PER_MICRO))
            .max_gas()
            .transact()
            .await?;
        if !r.is_success() {
            bail!("deposit failed: {:?}", r.failures());
        }
        let index: String = r.clone().json()?;
        Ok(Note { kind: 1, asset: 1, sub: 0, amount: micro, blinding, index: index.parse()? })
    }

    /// Spends one or two notes of the same (kind, asset, sub) through the relayer. On failure `change` and
    /// `minted` are None and the notes stay unspent.
    pub async fn spend(&mut self, env: &Env, notes: &[&Note], out_amount: u128, action: Value) -> Result<Spend> {
        let n0 = notes[0];
        let mut inputs: Vec<Value> =
            notes.iter().map(|n| json!({ "amount": s(n.amount), "blinding": s(n.blinding), "index": n.index })).collect();
        if inputs.len() == 1 {
            inputs.push(json!({ "amount": "0", "blinding": s(self.fresh()) }));
        }
        let change_blinding = self.fresh();
        let new_blinding = self.fresh();
        let leaves = all_leaves(env).await?;
        let p = cli(&json!({
            "op": "prove", "sk": self.sk, "leaves": leaves,
            "kind": n0.kind, "asset": n0.asset, "sub": n0.sub,
            "notes": inputs, "out_amount": s(out_amount), "change_blinding": s(change_blinding),
            "action": action, "new_blinding": s(new_blinding),
        }));
        let result = relay(env, &p).await?;
        if !result.is_success() {
            return Ok(Spend { result, change: None, minted: None });
        }
        let t: Value = result.clone().json()?;
        let idx = |k: &str| t[k].as_str().unwrap().parse::<u64>().unwrap();
        let change = Note {
            kind: n0.kind,
            asset: n0.asset,
            sub: n0.sub,
            amount: p["change_amount"].as_str().unwrap().parse()?,
            blinding: change_blinding,
            index: idx("change_index"),
        };
        let minted = (t["new_kind"].as_u64().unwrap() != 0).then(|| Note {
            kind: t["new_kind"].as_u64().unwrap() as u8,
            asset: t["new_asset"].as_str().unwrap().parse().unwrap(),
            sub: t["new_sub"].as_u64().unwrap() as u8,
            amount: t["new_amount"].as_str().unwrap().parse().unwrap(),
            blinding: new_blinding,
            index: idx("new_index"),
        });
        Ok(Spend { result, change: Some(change), minted })
    }
}

pub async fn all_leaves(env: &Env) -> Result<Vec<String>> {
    let mut out = Vec::new();
    loop {
        let page: Value =
            env.veiled.view("get_leaves").args_json(json!({ "from": s(out.len()), "limit": 500 })).await?.json()?;
        let page = page.as_array().unwrap();
        if page.is_empty() {
            return Ok(out);
        }
        out.extend(page.iter().map(|l| l["commitment"].as_str().unwrap().to_string()));
    }
}

pub async fn height(env: &Env) -> Result<u64> {
    let h: String = env.veiled.view("get_height").await?.json()?;
    Ok(h.parse()?)
}

/// Moves the virtual height (4 s ticks of block time) forward by at least `ticks`.
pub async fn advance(env: &Env, ticks: u64) -> Result<()> {
    let start = height(env).await?;
    let target = start + ticks;
    for _ in 0..40 {
        env.worker.fast_forward(ticks * 4 + 4).await?;
        let h = height(env).await?;
        if h >= target {
            println!("advance: +{} ticks (asked {ticks})", h - start);
            return Ok(());
        }
    }
    bail!("virtual height did not reach {target}")
}

/// Calls a contract method as `who`, attaching `near_micro` micro NEAR.
pub async fn call(env: &Env, who: &Account, method: &str, args: Value, micro: u128) -> Result<ExecutionFinalResult> {
    Ok(who
        .call(env.veiled.id(), method)
        .args_json(args)
        .deposit(NearToken::from_yoctonear(micro * YOCTO_PER_MICRO))
        .max_gas()
        .transact()
        .await?)
}

pub async fn view(env: &Env, method: &str, args: Value) -> Result<Value> {
    Ok(env.veiled.view(method).args_json(args).await?.json()?)
}

/// Integer FPMM replicas (contracts/veiled/src/math.rs) for expected values.
pub fn fpmm_buy(r: &[u128], n: usize, outcome: usize, a: u128) -> u128 {
    let i = outcome - 1;
    let mut x = r[i];
    for (k, rk) in r.iter().enumerate().take(n) {
        if k != i {
            x = x * rk / (rk + a);
        }
    }
    r[i] + a - x
}

pub fn fpmm_sell_needed(r: &[u128], n: usize, outcome: usize, p: u128) -> u128 {
    let i = outcome - 1;
    let mut x = r[i];
    for (k, rk) in r.iter().enumerate().take(n) {
        if k != i {
            x = x * rk / (rk - p);
        }
    }
    x - r[i] + p
}

pub fn u(v: &Value) -> u128 {
    v.as_str().unwrap_or_else(|| panic!("not a string: {v}")).parse().unwrap()
}
