//! Append-only Poseidon Merkle tree (depth 20) that takes leaves in pairs, with a 32-root history.
//! Mirrors near/circuits/lib/notes.mjs `MerkleTree`: empty leaf 0, zeros[i+1] = H(zeros[i], zeros[i]).

use crate::field::{Felt, ZERO};
use crate::poseidon::hash2;
use near_sdk::{near, require};

pub const DEPTH: usize = 20;
pub const ROOT_HISTORY: usize = 32;

#[near(serializers = [borsh])]
pub struct Tree {
    pub next_index: u64,
    zeros: Vec<Felt>,
    filled: Vec<Felt>,
    roots: Vec<Felt>,
    root_pos: u32,
}

impl Tree {
    pub fn new() -> Self {
        let mut zeros = vec![ZERO];
        for i in 0..DEPTH {
            let z = hash2(&zeros[i], &zeros[i]);
            zeros.push(z);
        }
        let mut roots = vec![ZERO; ROOT_HISTORY];
        roots[0] = zeros[DEPTH];
        Self { next_index: 0, filled: zeros[..DEPTH].to_vec(), zeros, roots, root_pos: 0 }
    }

    pub fn root(&self) -> Felt {
        self.roots[self.root_pos as usize]
    }

    pub fn is_known_root(&self, root: &Felt) -> bool {
        *root != ZERO && self.roots.iter().any(|r| r == root)
    }

    /// Inserts (a, b) at the next even index; returns the index of `a`.
    pub fn insert_pair(&mut self, a: &Felt, b: &Felt) -> u64 {
        let index = self.next_index;
        require!(index + 2 <= 1u64 << DEPTH, "ERR_TREE_FULL");
        let mut current = hash2(a, b);
        let mut current_index = index >> 1;
        for level in 1..DEPTH {
            let (left, right) = if current_index % 2 == 0 {
                self.filled[level] = current;
                (current, self.zeros[level])
            } else {
                (self.filled[level], current)
            };
            current = hash2(&left, &right);
            current_index >>= 1;
        }
        self.root_pos = ((self.root_pos as usize + 1) % ROOT_HISTORY) as u32;
        self.roots[self.root_pos as usize] = current;
        self.next_index = index + 2;
        index
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::field::{parse_fr, to_dec};

    fn fixture() -> serde_json::Value {
        let text = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../integration-tests/fixtures/pool.json"
        ))
        .expect("run near/circuits/scripts/gen-fixtures.mjs first");
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn root_matches_the_js_tree() {
        let fx = fixture();
        let leaves: Vec<Felt> =
            fx["expected"]["leaves"].as_array().unwrap().iter().map(|v| parse_fr(v.as_str().unwrap())).collect();
        let mut tree = Tree::new();
        let mut seen = vec![to_dec(&tree.root())];
        for pair in leaves.chunks(2) {
            tree.insert_pair(&pair[0], &pair[1]);
            seen.push(to_dec(&tree.root()));
        }
        let roots = &fx["expected"]["roots"];
        assert_eq!(seen[1], roots["R1"].as_str().unwrap());
        assert_eq!(seen[2], roots["R2"].as_str().unwrap());
        assert_eq!(seen[3], roots["R3"].as_str().unwrap());
        assert_eq!(seen[4], roots["R4"].as_str().unwrap());
        assert!(tree.is_known_root(&parse_fr(roots["R1"].as_str().unwrap())));
        assert!(!tree.is_known_root(&ZERO));
    }
}
