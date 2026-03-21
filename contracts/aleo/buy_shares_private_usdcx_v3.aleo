// ============================================================================
// buy_shares_private_usdcx - Private USDCX betting transition (v3)
// ============================================================================
// v18 approach restored: pass [MerkleProof; 2] as single input using
// UNQUALIFIED struct name. This avoids the snarkVM parser bug where
// qualified names (test_usdcx_stablecoin.aleo/MerkleProof) fail in
// input declarations and cast instructions.
//
// v2 (flattened) failed because cast instructions used qualified names.
// v3 goes back to v18's working approach: unqualified MerkleProof in input.
//
// Inputs:
//   r0: field.private         - market_id
//   r1: u8.private            - outcome (1-4)
//   r2: u128.private          - amount_in (microcredits)
//   r3: u128.private          - expected_shares
//   r4: u128.private          - min_shares_out
//   r5: field.private         - share_nonce
//   r6: Token.record          - USDCX token record (private)
//   r7: [MerkleProof; 2]      - freeze-list non-inclusion proofs
//
// Outputs:
//   OutcomeShare.record
//   ComplianceRecord.record (from USDCX transfer)
//   Token.record (change from USDCX transfer)
//   Future
// ============================================================================

function buy_shares_private_usdcx:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as field.private;
    input r6 as test_usdcx_stablecoin.aleo/Token.record;
    input r7 as [MerkleProof; 2u32].private;
    gte r1 1u8 into r8;
    lte r1 4u8 into r9;
    and r8 r9 into r10;
    assert.eq r10 true;
    gte r2 1000u128 into r11;
    assert.eq r11 true;
    cast self.caller r0 r1 r3 r5 2u8 into r12 as OutcomeShare.record;
    call test_usdcx_stablecoin.aleo/transfer_private_to_public veiled_markets_v29.aleo r2 r6 r7 into r13 r14 r15;
    async buy_shares_private_usdcx r15 r0 r1 r2 r3 r4 into r16;
    output r12 as OutcomeShare.record;
    output r13 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r14 as test_usdcx_stablecoin.aleo/Token.record;
    output r16 as veiled_markets_v29.aleo/buy_shares_private_usdcx.future;

finalize buy_shares_private_usdcx:
    input r0 as test_usdcx_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    await r0;
    get markets[r1] into r6;
    is.eq r6.status 1u8 into r7;
    assert.eq r7 true;
    is.eq r6.token_type 2u8 into r8;
    assert.eq r8 true;
    gte r2 1u8 into r9;
    lte r2 r6.num_outcomes into r10;
    and r9 r10 into r11;
    assert.eq r11 true;
    cast block.height into r12 as u64;
    lte r12 r6.deadline into r13;
    assert.eq r13 true;
    mul r3 50u128 into r14;
    div r14 10000u128 into r15;
    sub r3 r15 into r16;
    sub r16 r15 into r17;
    get market_fees[r1] into r18;
    add r18.protocol_fees r15 into r19;
    add r18.creator_fees r15 into r20;
    cast r1 r19 r20 into r21 as MarketFees;
    set r21 into market_fees[r1];
    get.or_use protocol_treasury[1u8] 0u128 into r22;
    add r22 r15 into r23;
    set r23 into protocol_treasury[1u8];
    get amm_pools[r1] into r24;
    is.eq r2 1u8 into r25;
    is.eq r2 2u8 into r26;
    is.eq r2 3u8 into r27;
    ternary r27 r24.reserve_3 r24.reserve_4 into r28;
    ternary r26 r24.reserve_2 r28 into r29;
    ternary r25 r24.reserve_1 r29 into r30;
    is.neq r2 1u8 into r31;
    mul r30 r24.reserve_1 into r32;
    add r24.reserve_1 r17 into r33;
    div r32 r33 into r34;
    ternary r31 r34 r30 into r35;
    is.neq r2 2u8 into r36;
    mul r35 r24.reserve_2 into r37;
    add r24.reserve_2 r17 into r38;
    div r37 r38 into r39;
    ternary r36 r39 r35 into r40;
    is.neq r2 3u8 into r41;
    gte r6.num_outcomes 3u8 into r42;
    and r41 r42 into r43;
    mul r40 r24.reserve_3 into r44;
    add r24.reserve_3 r17 into r45;
    div r44 r45 into r46;
    ternary r43 r46 r40 into r47;
    is.neq r2 4u8 into r48;
    gte r6.num_outcomes 4u8 into r49;
    and r48 r49 into r50;
    mul r47 r24.reserve_4 into r51;
    add r24.reserve_4 r17 into r52;
    div r51 r52 into r53;
    ternary r50 r53 r47 into r54;
    add r30 r17 into r55;
    sub r55 r54 into r56;
    gte r56 r5 into r57;
    assert.eq r57 true;
    gte r56 r4 into r58;
    assert.eq r58 true;
    gt r56 0u128 into r59;
    assert.eq r59 true;
    ternary r25 r54 r33 into r60;
    ternary r26 r54 r38 into r61;
    ternary r27 r54 r45 into r62;
    ternary r42 r62 0u128 into r63;
    is.eq r2 4u8 into r64;
    ternary r64 r54 r52 into r65;
    ternary r49 r65 0u128 into r66;
    add r24.total_liquidity r17 into r67;
    add r24.total_volume r3 into r68;
    cast r1 r60 r61 r63 r66 r67 r24.total_lp_shares r68 into r69 as AMMPool;
    set r69 into amm_pools[r1];
    get.or_use program_credits[1u8] 0u128 into r70;
    add r70 r3 into r71;
    set r71 into program_credits[1u8];
    get.or_use market_credits[r1] 0u128 into r72;
    add r72 r3 into r73;
    set r73 into market_credits[r1];
