//! BN254 field elements as they cross the contract boundary: decimal strings in JSON, 32-byte little-endian
//! integers in storage and in NEAR's alt_bn128 host functions.

use ark_bn254::Fr;
use ark_ff::{BigInt, BigInteger, PrimeField};
use near_sdk::require;

/// A canonical field element, 32 bytes little-endian.
pub type Felt = [u8; 32];

pub const ZERO: Felt = [0u8; 32];

/// BN254 base-field modulus q (proof coordinates must be below it).
const Q_LIMBS: [u64; 4] = [0x3c208c16d87cfd47, 0x97816a916871ca8d, 0xb85045b68181585d, 0x30644e72e131a029];

fn parse_dec_u256(s: &str) -> Option<[u64; 4]> {
    if s.is_empty() || s.len() > 78 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let mut v = [0u64; 4];
    for b in s.bytes() {
        let mut carry = (b - b'0') as u128;
        for limb in v.iter_mut() {
            let x = (*limb as u128) * 10 + carry;
            *limb = x as u64;
            carry = x >> 64;
        }
        if carry != 0 {
            return None;
        }
    }
    Some(v)
}

fn lt(a: &[u64; 4], b: &[u64; 4]) -> bool {
    for i in (0..4).rev() {
        if a[i] != b[i] {
            return a[i] < b[i];
        }
    }
    false
}

fn limbs_to_le(v: &[u64; 4]) -> Felt {
    let mut out = [0u8; 32];
    for (i, limb) in v.iter().enumerate() {
        out[i * 8..i * 8 + 8].copy_from_slice(&limb.to_le_bytes());
    }
    out
}

fn le_to_limbs(b: &Felt) -> [u64; 4] {
    let mut v = [0u64; 4];
    for (i, limb) in v.iter_mut().enumerate() {
        *limb = u64::from_le_bytes(b[i * 8..i * 8 + 8].try_into().unwrap());
    }
    v
}

/// Parses a decimal scalar-field element (< r). Panics with `ERR_FIELD` otherwise.
pub fn parse_fr(s: &str) -> Felt {
    let v = parse_dec_u256(s).unwrap_or_else(|| near_sdk::env::panic_str("ERR_FIELD"));
    require!(lt(&v, &Fr::MODULUS.0), "ERR_FIELD");
    limbs_to_le(&v)
}

/// Parses a decimal base-field coordinate (< q). Panics with `ERR_FIELD` otherwise.
pub fn parse_fq(s: &str) -> Felt {
    let v = parse_dec_u256(s).unwrap_or_else(|| near_sdk::env::panic_str("ERR_FIELD"));
    require!(lt(&v, &Q_LIMBS), "ERR_FIELD");
    limbs_to_le(&v)
}

pub fn to_fr(b: &Felt) -> Fr {
    Fr::from_bigint(BigInt(le_to_limbs(b))).unwrap_or_else(|| near_sdk::env::panic_str("ERR_FIELD"))
}

pub fn from_fr(f: &Fr) -> Felt {
    let bytes = f.into_bigint().to_bytes_le();
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes[..32]);
    out
}

pub fn from_u128(x: u128) -> Felt {
    let mut out = [0u8; 32];
    out[..16].copy_from_slice(&x.to_le_bytes());
    out
}

/// The value of a field element that must fit in a u128 (amounts, ids, kinds). Panics with `ERR_FIELD_RANGE`.
pub fn to_u128(b: &Felt) -> u128 {
    require!(b[16..].iter().all(|&x| x == 0), "ERR_FIELD_RANGE");
    u128::from_le_bytes(b[..16].try_into().unwrap())
}

pub fn to_dec(b: &Felt) -> String {
    let mut v = le_to_limbs(b);
    if v == [0; 4] {
        return "0".to_string();
    }
    let mut digits = Vec::with_capacity(78);
    while v != [0; 4] {
        let mut rem: u128 = 0;
        for limb in v.iter_mut().rev() {
            let cur = (rem << 64) | (*limb as u128);
            *limb = (cur / 10) as u64;
            rem = cur % 10;
        }
        digits.push(b'0' + rem as u8);
    }
    digits.reverse();
    String::from_utf8(digits).unwrap()
}

/// sha256 of the exact ext_data text, read big-endian with the top 3 bits cleared (always < r).
pub fn ext_data_hash(text: &str) -> Felt {
    let mut h = near_sdk::env::sha256_array(text.as_bytes());
    h[0] &= 0x1f;
    h.reverse();
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_round_trip_and_bounds() {
        let r_minus_1 = "21888242871839275222246405745257275088548364400416034343698204186575808495616";
        assert_eq!(to_dec(&parse_fr(r_minus_1)), r_minus_1);
        assert_eq!(to_dec(&parse_fr("0")), "0");
        assert_eq!(to_u128(&parse_fr("340282366920938463463374607431768211455")), u128::MAX);
    }

    #[test]
    #[should_panic(expected = "ERR_FIELD")]
    fn rejects_scalar_modulus() {
        parse_fr("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    }
}
