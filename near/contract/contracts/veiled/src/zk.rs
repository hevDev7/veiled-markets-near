//! Groth16 verification on BN254 with NEAR's alt_bn128 host functions.
//! Encoding (see near_groth16_verifier, hideyour-cash): 32-byte little-endian coordinates, G1 = (x, y),
//! G2 = (x.c0, x.c1, y.c0, y.c1), g1_sum items = (sign byte, G1), multiexp items = (G1, scalar).

use crate::field::{parse_fq, Felt};
use crate::types::ProofArgs;
use crate::vk;
use near_sdk::env;

pub struct Proof {
    a: [u8; 64],
    b: [u8; 128],
    c: [u8; 64],
}

impl Proof {
    pub fn parse(p: &ProofArgs) -> Self {
        let mut a = [0u8; 64];
        a[..32].copy_from_slice(&parse_fq(&p.a[0]));
        a[32..].copy_from_slice(&parse_fq(&p.a[1]));
        let mut b = [0u8; 128];
        b[..32].copy_from_slice(&parse_fq(&p.b[0][0]));
        b[32..64].copy_from_slice(&parse_fq(&p.b[0][1]));
        b[64..96].copy_from_slice(&parse_fq(&p.b[1][0]));
        b[96..].copy_from_slice(&parse_fq(&p.b[1][1]));
        let mut c = [0u8; 64];
        c[..32].copy_from_slice(&parse_fq(&p.c[0]));
        c[32..].copy_from_slice(&parse_fq(&p.c[1]));
        Self { a, b, c }
    }
}

/// e(-A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) == 1, vk_x = IC0 + Σ inputs[i]·IC[i+1].
pub fn verify(proof: &Proof, inputs: &[Felt; vk::N_PUBLIC]) -> bool {
    let mut multiexp = Vec::with_capacity(96 * vk::N_PUBLIC);
    for (i, input) in inputs.iter().enumerate() {
        multiexp.extend_from_slice(&vk::IC[i + 1]);
        multiexp.extend_from_slice(input);
    }
    let acc = env::alt_bn128_g1_multiexp(&multiexp);

    let mut sum = Vec::with_capacity(130);
    sum.push(0);
    sum.extend_from_slice(&vk::IC[0]);
    sum.push(0);
    sum.extend_from_slice(&acc);
    let vk_x = env::alt_bn128_g1_sum(&sum);

    let mut neg = Vec::with_capacity(65);
    neg.push(1);
    neg.extend_from_slice(&proof.a);
    let neg_a = env::alt_bn128_g1_sum(&neg);

    let mut pairing = Vec::with_capacity(192 * 4);
    pairing.extend_from_slice(&neg_a);
    pairing.extend_from_slice(&proof.b);
    pairing.extend_from_slice(&vk::ALPHA_G1);
    pairing.extend_from_slice(&vk::BETA_G2);
    pairing.extend_from_slice(&vk_x);
    pairing.extend_from_slice(&vk::GAMMA_G2);
    pairing.extend_from_slice(&proof.c);
    pairing.extend_from_slice(&vk::DELTA_G2);
    env::alt_bn128_pairing_check(&pairing)
}
