//! Poseidon over BN254 with circomlib's parameters (circomlibjs `poseidon_reference`), matching spend.circom.
//! Only the two widths the contract needs are linked: t = 3 (tree nodes) and t = 6 (note commitments).

use crate::field::{from_fr, from_u128, to_fr, Felt};
use crate::poseidon_constants::*;
use ark_bn254::Fr;
use ark_ff::{Field, Zero};

#[inline]
fn pow5(x: Fr) -> Fr {
    let x2 = x.square();
    x2.square() * x
}

fn permute<const T: usize>(mut state: [Fr; T], c: &[Fr], m: &[[Fr; T]; T], n_rounds_p: usize) -> Fr {
    let half_f = N_ROUNDS_F / 2;
    for r in 0..N_ROUNDS_F + n_rounds_p {
        for (i, s) in state.iter_mut().enumerate() {
            *s += c[r * T + i];
        }
        if r < half_f || r >= half_f + n_rounds_p {
            for s in state.iter_mut() {
                *s = pow5(*s);
            }
        } else {
            state[0] = pow5(state[0]);
        }
        let mut next = [Fr::zero(); T];
        for (i, row) in m.iter().enumerate() {
            let mut acc = Fr::zero();
            for (j, s) in state.iter().enumerate() {
                acc += row[j] * s;
            }
            next[i] = acc;
        }
        state = next;
    }
    state[0]
}

pub fn hash2(a: &Felt, b: &Felt) -> Felt {
    from_fr(&permute([Fr::zero(), to_fr(a), to_fr(b)], &C3, &M3, N_ROUNDS_P_3))
}

pub fn hash5(x: &[Felt; 5]) -> Felt {
    let state = [Fr::zero(), to_fr(&x[0]), to_fr(&x[1]), to_fr(&x[2]), to_fr(&x[3]), to_fr(&x[4])];
    from_fr(&permute(state, &C6, &M6, N_ROUNDS_P_6))
}

/// commitment = Poseidon(kind, asset, sub, amount, ownerBlind)
pub fn note_commitment(kind: u8, asset: u64, sub: u8, amount: u128, owner_blind: &Felt) -> Felt {
    hash5(&[from_u128(kind as u128), from_u128(asset as u128), from_u128(sub as u128), from_u128(amount), *owner_blind])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::field::{parse_fr, to_dec};

    #[test]
    fn circomlib_reference_vector() {
        let h = hash2(&from_u128(1), &from_u128(2));
        assert_eq!(
            to_dec(&h),
            // 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a
            "7853200120776062878684798364095072458815029376092732009249414926327459813530"
        );
    }

    #[test]
    fn five_input_commitment_matches_the_fixture_deposit() {
        let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../integration-tests/fixtures/pool.json"))
            .unwrap();
        let fx: serde_json::Value = serde_json::from_str(&text).unwrap();
        let a = &fx["deposits"]["A"];
        let c = note_commitment(1, 1, 0, 2_000_000, &parse_fr(a["owner_blind"].as_str().unwrap()));
        assert_eq!(to_dec(&c), a["commitment"].as_str().unwrap());
    }
}
