import credits.aleo;
import merkle_tree.aleo;
import test_usad_multisig_core.aleo;
import test_usad_freezelist.aleo;
import test_usad_stablecoin.aleo;
program veiled_markets_usad_v12.aleo;

record OutcomeShare:
    owner as address.private;
    market_id as field.private;
    outcome as u8.private;
    quantity as u128.private;
    share_nonce as field.private;
    token_type as u8.private;

record LPToken:
    owner as address.private;
    market_id as field.private;
    lp_shares as u128.private;
    lp_nonce as field.private;
    token_type as u8.private;

record VoterBondReceipt:
    owner as address.private;
    market_id as field.private;
    voted_outcome as u8.private;
    bond_amount as u128.private;
    bond_nonce as field.private;

record DisputeBondReceipt:
    owner as address.private;
    market_id as field.private;
    proposed_outcome as u8.private;
    bond_amount as u128.private;
    dispute_nonce as field.private;

record RefundClaim:
    owner as address.private;
    market_id as field.private;
    amount as u128.private;
    claim_nonce as field.private;
    token_type as u8.private;

struct Market:
    id as field;
    creator as address;
    resolver as address;
    question_hash as field;
    category as u8;
    num_outcomes as u8;
    deadline as u64;
    resolution_deadline as u64;
    status as u8;
    created_at as u64;
    token_type as u8;

struct AMMPool:
    market_id as field;
    reserve_1 as u128;
    reserve_2 as u128;
    reserve_3 as u128;
    reserve_4 as u128;
    total_liquidity as u128;
    total_lp_shares as u128;
    total_volume as u128;

struct VoteTally:
    market_id as field;
    outcome_1_bonds as u128;
    outcome_2_bonds as u128;
    outcome_3_bonds as u128;
    outcome_4_bonds as u128;
    total_voters as u8;
    total_bonded as u128;
    voting_deadline as u64;
    dispute_deadline as u64;
    finalized as boolean;
    winning_outcome as u8;

struct MarketFees:
    market_id as field;
    protocol_fees as u128;
    creator_fees as u128;

struct BondClaimKey:
    market_id as field;
    claimer as address;
    bond_nonce as field;

struct VoterKey:
    market_id as field;
    voter as address;

struct SignerConfig:
    signer_1 as address;
    signer_2 as address;
    signer_3 as address;
    threshold as u8;

struct MultiSigProposal:
    proposal_id as field;
    action as u8;
    amount as u128;
    recipient as address;
    token_type as u8;
    proposed_at as u64;

struct MarketSeed:
    creator as address;
    question_hash as field;
    deadline as u64;
    nonce as u64;

struct ShareClaimKey:
    market_id as field;
    claimer as address;
    share_nonce as field;

struct LPClaimKey:
    market_id as field;
    claimer as address;
    lp_nonce as field;

struct ProposalSeed:
    proposer as address;
    action as u8;
    amount as u128;
    recipient as address;
    token_type as u8;
    nonce as u64;

struct ApprovalKey:
    proposal_id as field;
    signer as address;

mapping markets:
    key as field.public;
    value as Market.public;

mapping amm_pools:
    key as field.public;
    value as AMMPool.public;

mapping market_fees:
    key as field.public;
    value as MarketFees.public;

mapping share_redeemed:
    key as field.public;
    value as boolean.public;

mapping creator_fees_claimed:
    key as field.public;
    value as boolean.public;

mapping program_credits:
    key as u8.public;
    value as u128.public;

mapping market_credits:
    key as field.public;
    value as u128.public;

mapping protocol_treasury:
    key as u8.public;
    value as u128.public;

mapping multisig_config:
    key as u8.public;
    value as SignerConfig.public;

mapping multisig_proposals:
    key as field.public;
    value as MultiSigProposal.public;

mapping multisig_approvals:
    key as field.public;
    value as boolean.public;

mapping lp_positions:
    key as field.public;
    value as boolean.public;

mapping vote_tallies:
    key as field.public;
    value as VoteTally.public;

mapping voter_participated:
    key as field.public;
    value as boolean.public;

mapping bond_claimed:
    key as field.public;
    value as boolean.public;

mapping voter_rewards:
    key as address.public;
    value as u128.public;

mapping dispute_bonds:
    key as field.public;
    value as u128.public;

mapping governance_values:
    key as field.public;
    value as u128.public;

function set_governance_value:
    input r0 as field.public;
    input r1 as u128.public;
    async set_governance_value r0 r1 self.caller into r2;
    output r2 as veiled_markets_usad_v12.aleo/set_governance_value.future;

finalize set_governance_value:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    is.eq r2 aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8 into r3;
    assert.eq r3 true;
    is.eq r0 1field into r4;
    is.eq r0 2field into r5;
    or r4 r5 into r6;
    is.eq r0 3field into r7;
    or r6 r7 into r8;
    is.eq r0 4field into r9;
    or r8 r9 into r10;
    is.eq r0 5field into r11;
    or r10 r11 into r12;
    is.eq r0 6field into r13;
    or r12 r13 into r14;
    assert.eq r14 true;
    get.or_use governance_values[1field] 50u128 into r15;
    ternary r4 r1 r15 into r16;
    get.or_use governance_values[2field] 50u128 into r17;
    ternary r5 r1 r17 into r18;
    get.or_use governance_values[3field] 100u128 into r19;
    ternary r7 r1 r19 into r20;
    branch.eq r8 false to end_then_0_0;
    add r16 r18 into r21;
    add r21 r20 into r22;
    lt r22 10000u128 into r23;
    assert.eq r23 true;
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    position end_otherwise_0_1;
    or r9 r11 into r24;
    branch.eq r24 false to end_then_0_2;
    gt r1 0u128 into r25;
    assert.eq r25 true;
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    position end_otherwise_0_3;
    branch.eq r13 false to end_then_0_4;
    lte r1 1u128 into r26;
    assert.eq r26 true;
    branch.eq true true to end_otherwise_0_5;
    position end_then_0_4;
    position end_otherwise_0_5;
    set r1 into governance_values[r0];

function create_market_usad:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as u8.public;
    input r3 as u64.public;
    input r4 as u64.public;
    input r5 as address.public;
    input r6 as u128.private;
    gte r2 2u8 into r7;
    lte r2 4u8 into r8;
    and r7 r8 into r9;
    assert.eq r9 true;
    gte r6 10000u128 into r10;
    assert.eq r10 true;
    cast self.caller r0 r3 r4 into r11 as MarketSeed;
    hash.bhp256 r11 into r12 as field;
    cast r12 self.caller 0field into r13 as LPClaimKey;
    hash.bhp256 r13 into r14 as field;
    cast self.caller r12 r6 r14 3u8 into r15 as LPToken.record;
    call test_usad_stablecoin.aleo/transfer_public_as_signer veiled_markets_usad_v12.aleo r6 into r16;
    async create_market_usad r16 r12 self.caller r0 r1 r2 r3 r4 r5 r6 into r17;
    output r12 as field.private;
    output r15 as LPToken.record;
    output r17 as veiled_markets_usad_v12.aleo/create_market_usad.future;

finalize create_market_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as u64.public;
    input r7 as u64.public;
    input r8 as address.public;
    input r9 as u128.public;
    await r0;
    contains markets[r1] into r10;
    not r10 into r11;
    assert.eq r11 true;
    cast block.height into r12 as u64;
    get.or_use governance_values[6field] 0u128 into r13;
    is.eq r13 0u128 into r14;
    assert.eq r14 true;
    get.or_use governance_values[5field] 10000u128 into r15;
    gte r9 r15 into r16;
    assert.eq r16 true;
    gt r6 r12 into r17;
    assert.eq r17 true;
    gt r7 r6 into r18;
    assert.eq r18 true;
    cast r1 r2 r8 r3 r4 r5 r6 r7 1u8 r12 3u8 into r19 as Market;
    cast r5 into r20 as u128;
    div r9 r20 into r21;
    gte r5 3u8 into r22;
    ternary r22 r21 0u128 into r23;
    gte r5 4u8 into r24;
    ternary r24 r21 0u128 into r25;
    cast r1 r21 r21 r23 r25 r9 r9 0u128 into r26 as AMMPool;
    set r19 into markets[r1];
    set r26 into amm_pools[r1];
    cast r1 0u128 0u128 into r27 as MarketFees;
    set r27 into market_fees[r1];
    get.or_use program_credits[2u8] 0u128 into r28;
    add r28 r9 into r29;
    set r29 into program_credits[2u8];
    set r9 into market_credits[r1];

function buy_shares_usad:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as field.private;
    input r6 as test_usad_stablecoin.aleo/Token.record;
    input r7 as [test_usad_stablecoin.aleo/MerkleProof; 2u32].private;
    gte r1 1u8 into r8;
    lte r1 4u8 into r9;
    and r8 r9 into r10;
    assert.eq r10 true;
    gte r2 1000u128 into r11;
    assert.eq r11 true;
    cast self.caller r0 r1 r3 r5 3u8 into r12 as OutcomeShare.record;
    call test_usad_stablecoin.aleo/transfer_private_to_public veiled_markets_usad_v12.aleo r2 r6 r7 into r13 r14 r15;
    async buy_shares_usad r15 r0 r1 r2 r3 r4 into r16;
    output r12 as OutcomeShare.record;
    output r13 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r14 as test_usad_stablecoin.aleo/Token.record;
    output r16 as veiled_markets_usad_v12.aleo/buy_shares_usad.future;

finalize buy_shares_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    await r0;
    get markets[r1] into r6;
    is.eq r6.status 1u8 into r7;
    assert.eq r7 true;
    is.eq r6.token_type 3u8 into r8;
    assert.eq r8 true;
    gte r2 1u8 into r9;
    lte r2 r6.num_outcomes into r10;
    and r9 r10 into r11;
    assert.eq r11 true;
    cast block.height into r12 as u64;
    get.or_use governance_values[4field] 1000u128 into r13;
    gte r3 r13 into r14;
    assert.eq r14 true;
    lte r12 r6.deadline into r15;
    assert.eq r15 true;
    get.or_use governance_values[6field] 0u128 into r16;
    is.eq r16 0u128 into r17;
    assert.eq r17 true;
    get.or_use governance_values[1field] 50u128 into r18;
    get.or_use governance_values[2field] 50u128 into r19;
    mul r3 r18 into r20;
    div r20 10000u128 into r21;
    mul r3 r19 into r22;
    div r22 10000u128 into r23;
    sub r3 r21 into r24;
    sub r24 r23 into r25;
    get market_fees[r1] into r26;
    add r26.protocol_fees r21 into r27;
    add r26.creator_fees r23 into r28;
    cast r1 r27 r28 into r29 as MarketFees;
    set r29 into market_fees[r1];
    get.or_use protocol_treasury[2u8] 0u128 into r30;
    add r30 r21 into r31;
    set r31 into protocol_treasury[2u8];
    get amm_pools[r1] into r32;
    is.eq r2 1u8 into r33;
    is.eq r2 2u8 into r34;
    is.eq r2 3u8 into r35;
    ternary r35 r32.reserve_3 r32.reserve_4 into r36;
    ternary r34 r32.reserve_2 r36 into r37;
    ternary r33 r32.reserve_1 r37 into r38;
    is.neq r2 1u8 into r39;
    mul r38 r32.reserve_1 into r40;
    add r32.reserve_1 r25 into r41;
    div r40 r41 into r42;
    ternary r39 r42 r38 into r43;
    is.neq r2 2u8 into r44;
    mul r43 r32.reserve_2 into r45;
    add r32.reserve_2 r25 into r46;
    div r45 r46 into r47;
    ternary r44 r47 r43 into r48;
    is.neq r2 3u8 into r49;
    gte r6.num_outcomes 3u8 into r50;
    and r49 r50 into r51;
    mul r48 r32.reserve_3 into r52;
    add r32.reserve_3 r25 into r53;
    div r52 r53 into r54;
    ternary r51 r54 r48 into r55;
    is.neq r2 4u8 into r56;
    gte r6.num_outcomes 4u8 into r57;
    and r56 r57 into r58;
    mul r55 r32.reserve_4 into r59;
    add r32.reserve_4 r25 into r60;
    div r59 r60 into r61;
    ternary r58 r61 r55 into r62;
    add r38 r25 into r63;
    sub r63 r62 into r64;
    gte r64 r5 into r65;
    assert.eq r65 true;
    gte r64 r4 into r66;
    assert.eq r66 true;
    gt r64 0u128 into r67;
    assert.eq r67 true;
    ternary r33 r62 r41 into r68;
    ternary r34 r62 r46 into r69;
    ternary r35 r62 r53 into r70;
    ternary r50 r70 0u128 into r71;
    is.eq r2 4u8 into r72;
    ternary r72 r62 r60 into r73;
    ternary r57 r73 0u128 into r74;
    add r32.total_liquidity r25 into r75;
    add r32.total_volume r3 into r76;
    cast r1 r68 r69 r71 r74 r75 r32.total_lp_shares r76 into r77 as AMMPool;
    set r77 into amm_pools[r1];
    get.or_use program_credits[2u8] 0u128 into r78;
    add r78 r3 into r79;
    set r79 into program_credits[2u8];
    get.or_use market_credits[r1] 0u128 into r80;
    add r80 r3 into r81;
    set r81 into market_credits[r1];

function sell_shares_usad:
    input r0 as OutcomeShare.record;
    input r1 as u128.private;
    input r2 as u128.private;
    is.eq r0.owner self.caller into r3;
    assert.eq r3 true;
    is.eq r0.token_type 3u8 into r4;
    assert.eq r4 true;
    gte r1 1000u128 into r5;
    assert.eq r5 true;
    gt r2 0u128 into r6;
    assert.eq r6 true;
    lte r2 r0.quantity into r7;
    assert.eq r7 true;
    mul r1 50u128 into r8;
    div r8 10000u128 into r9;
    mul r1 100u128 into r10;
    div r10 10000u128 into r11;
    sub r1 r9 into r12;
    sub r12 r9 into r13;
    sub r13 r11 into r14;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r14 into r15 r16 r17;
    sub r0.quantity r2 into r18;
    cast self.caller r0.market_id r0.outcome r18 r0.share_nonce 3u8 into r19 as OutcomeShare.record;
    async sell_shares_usad r17 r0.market_id r0.outcome r1 r2 into r20;
    output r19 as OutcomeShare.record;
    output r15 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r16 as test_usad_stablecoin.aleo/Token.record;
    output r20 as veiled_markets_usad_v12.aleo/sell_shares_usad.future;

finalize sell_shares_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u128.public;
    input r4 as u128.public;
    await r0;
    get markets[r1] into r5;
    is.eq r5.status 1u8 into r6;
    assert.eq r6 true;
    is.eq r5.token_type 3u8 into r7;
    assert.eq r7 true;
    gte r2 1u8 into r8;
    lte r2 r5.num_outcomes into r9;
    and r8 r9 into r10;
    assert.eq r10 true;
    cast block.height into r11 as u64;
    get.or_use governance_values[6field] 0u128 into r12;
    is.eq r12 0u128 into r13;
    assert.eq r13 true;
    get.or_use governance_values[4field] 1000u128 into r14;
    gte r3 r14 into r15;
    assert.eq r15 true;
    lte r11 r5.deadline into r16;
    assert.eq r16 true;
    mul r3 50u128 into r17;
    div r17 10000u128 into r18;
    mul r3 100u128 into r19;
    div r19 10000u128 into r20;
    sub r3 r18 into r21;
    sub r21 r18 into r22;
    sub r22 r20 into r23;
    sub r3 r20 into r24;
    get market_fees[r1] into r25;
    add r25.protocol_fees r18 into r26;
    add r25.creator_fees r18 into r27;
    cast r1 r26 r27 into r28 as MarketFees;
    set r28 into market_fees[r1];
    get.or_use protocol_treasury[2u8] 0u128 into r29;
    add r29 r18 into r30;
    set r30 into protocol_treasury[2u8];
    get amm_pools[r1] into r31;
    is.eq r2 1u8 into r32;
    is.eq r2 2u8 into r33;
    is.eq r2 3u8 into r34;
    ternary r34 r31.reserve_3 r31.reserve_4 into r35;
    ternary r33 r31.reserve_2 r35 into r36;
    ternary r32 r31.reserve_1 r36 into r37;
    is.neq r2 1u8 into r38;
    ternary r38 r24 0u128 into r39;
    gte r31.reserve_1 r39 into r40;
    assert.eq r40 true;
    sub r31.reserve_1 r39 into r41;
    mul r37 r31.reserve_1 into r42;
    div r42 r41 into r43;
    ternary r38 r43 r37 into r44;
    is.neq r2 2u8 into r45;
    ternary r45 r24 0u128 into r46;
    gte r31.reserve_2 r46 into r47;
    assert.eq r47 true;
    sub r31.reserve_2 r46 into r48;
    mul r44 r31.reserve_2 into r49;
    div r49 r48 into r50;
    ternary r45 r50 r44 into r51;
    is.neq r2 3u8 into r52;
    gte r5.num_outcomes 3u8 into r53;
    and r52 r53 into r54;
    ternary r54 r24 0u128 into r55;
    gte r31.reserve_3 r55 into r56;
    assert.eq r56 true;
    sub r31.reserve_3 r55 into r57;
    is.eq r57 0u128 into r58;
    ternary r58 1u128 r57 into r59;
    mul r51 r31.reserve_3 into r60;
    div r60 r59 into r61;
    ternary r54 r61 r51 into r62;
    is.neq r2 4u8 into r63;
    gte r5.num_outcomes 4u8 into r64;
    and r63 r64 into r65;
    ternary r65 r24 0u128 into r66;
    gte r31.reserve_4 r66 into r67;
    assert.eq r67 true;
    sub r31.reserve_4 r66 into r68;
    is.eq r68 0u128 into r69;
    ternary r69 1u128 r68 into r70;
    mul r62 r31.reserve_4 into r71;
    div r71 r70 into r72;
    ternary r65 r72 r62 into r73;
    sub r73 r37 into r74;
    add r74 r24 into r75;
    lte r75 r4 into r76;
    assert.eq r76 true;
    gt r75 0u128 into r77;
    assert.eq r77 true;
    ternary r32 r73 r41 into r78;
    ternary r33 r73 r48 into r79;
    ternary r34 r73 r57 into r80;
    ternary r53 r80 0u128 into r81;
    is.eq r2 4u8 into r82;
    ternary r82 r73 r68 into r83;
    ternary r64 r83 0u128 into r84;
    sub r31.total_liquidity r24 into r85;
    add r31.total_volume r3 into r86;
    cast r1 r78 r79 r81 r84 r85 r31.total_lp_shares r86 into r87 as AMMPool;
    set r87 into amm_pools[r1];
    get.or_use market_credits[r1] 0u128 into r88;
    gte r88 r24 into r89;
    assert.eq r89 true;
    sub r88 r24 into r90;
    set r90 into market_credits[r1];
    get.or_use program_credits[2u8] 0u128 into r91;
    gte r91 r23 into r92;
    assert.eq r92 true;
    sub r91 r23 into r93;
    set r93 into program_credits[2u8];

function add_liquidity_usad:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as field.private;
    gte r1 10000u128 into r4;
    assert.eq r4 true;
    cast self.caller r0 r2 r3 3u8 into r5 as LPToken.record;
    call test_usad_stablecoin.aleo/transfer_public_as_signer veiled_markets_usad_v12.aleo r1 into r6;
    async add_liquidity_usad r6 r0 r1 r2 into r7;
    output r5 as LPToken.record;
    output r7 as veiled_markets_usad_v12.aleo/add_liquidity_usad.future;

finalize add_liquidity_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    await r0;
    get markets[r1] into r4;
    is.eq r4.status 1u8 into r5;
    assert.eq r5 true;
    is.eq r4.token_type 3u8 into r6;
    assert.eq r6 true;
    cast block.height into r7 as u64;
    get.or_use governance_values[6field] 0u128 into r8;
    is.eq r8 0u128 into r9;
    assert.eq r9 true;
    get.or_use governance_values[5field] 10000u128 into r10;
    gte r2 r10 into r11;
    assert.eq r11 true;
    lte r7 r4.deadline into r12;
    assert.eq r12 true;
    get amm_pools[r1] into r13;
    add r13.reserve_1 r13.reserve_2 into r14;
    add r14 r13.reserve_3 into r15;
    add r15 r13.reserve_4 into r16;
    gt r16 0u128 into r17;
    assert.eq r17 true;
    mul r2 r13.total_lp_shares into r18;
    div r18 r16 into r19;
    gte r19 r3 into r20;
    assert.eq r20 true;
    gt r3 0u128 into r21;
    assert.eq r21 true;
    mul r2 r13.reserve_1 into r22;
    div r22 r16 into r23;
    mul r2 r13.reserve_2 into r24;
    div r24 r16 into r25;
    mul r2 r13.reserve_3 into r26;
    div r26 r16 into r27;
    sub r2 r23 into r28;
    sub r28 r25 into r29;
    sub r29 r27 into r30;
    add r13.reserve_1 r23 into r31;
    add r13.reserve_2 r25 into r32;
    add r13.reserve_3 r27 into r33;
    add r13.reserve_4 r30 into r34;
    add r13.total_liquidity r2 into r35;
    add r13.total_lp_shares r3 into r36;
    cast r1 r31 r32 r33 r34 r35 r36 r13.total_volume into r37 as AMMPool;
    set r37 into amm_pools[r1];
    get.or_use program_credits[2u8] 0u128 into r38;
    add r38 r2 into r39;
    set r39 into program_credits[2u8];
    get.or_use market_credits[r1] 0u128 into r40;
    add r40 r2 into r41;
    set r41 into market_credits[r1];

function close_market:
    input r0 as field.public;
    async close_market r0 into r1;
    output r1 as veiled_markets_usad_v12.aleo/close_market.future;

finalize close_market:
    input r0 as field.public;
    get markets[r0] into r1;
    is.eq r1.status 1u8 into r2;
    assert.eq r2 true;
    cast block.height into r3 as u64;
    gt r3 r1.deadline into r4;
    assert.eq r4 true;
    cast r1.id r1.creator r1.resolver r1.question_hash r1.category r1.num_outcomes r1.deadline r1.resolution_deadline 2u8 r1.created_at r1.token_type into r5 as Market;
    set r5 into markets[r0];

function vote_outcome:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as field.private;
    input r3 as credits.aleo/credits.record;
    cast self.caller r0 r1 1000000u128 r2 into r4 as VoterBondReceipt.record;
    call credits.aleo/transfer_private_to_public r3 veiled_markets_usad_v12.aleo 1000000u64 into r5 r6;
    async vote_outcome r6 r0 r1 self.caller into r7;
    output r4 as VoterBondReceipt.record;
    output r5 as credits.aleo/credits.record;
    output r7 as veiled_markets_usad_v12.aleo/vote_outcome.future;

finalize vote_outcome:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as address.public;
    await r0;
    get markets[r1] into r4;
    gte r2 1u8 into r5;
    lte r2 r4.num_outcomes into r6;
    and r5 r6 into r7;
    assert.eq r7 true;
    cast block.height into r8 as u64;
    is.eq r4.status 2u8 into r9;
    is.eq r4.status 5u8 into r10;
    is.eq r4.status 1u8 into r11;
    gt r8 r4.deadline into r12;
    and r11 r12 into r13;
    or r9 r10 into r14;
    or r14 r13 into r15;
    assert.eq r15 true;
    lte r8 r4.resolution_deadline into r16;
    assert.eq r16 true;
    cast r1 r3 into r17 as VoterKey;
    hash.bhp256 r17 into r18 as field;
    get.or_use voter_participated[r18] false into r19;
    not r19 into r20;
    assert.eq r20 true;
    set true into voter_participated[r18];
    cast r1 0u128 0u128 0u128 0u128 0u8 0u128 0u64 0u64 false 0u8 into r21 as VoteTally;
    contains vote_tallies[r1] into r22;
    get.or_use vote_tallies[r1] r21 into r23;
    add r8 2880u64 into r24;
    ternary r22 r23.voting_deadline r24 into r25;
    not r22 into r26;
    lte r8 r25 into r27;
    or r26 r27 into r28;
    assert.eq r28 true;
    is.eq r2 1u8 into r29;
    add r23.outcome_1_bonds 1000000u128 into r30;
    ternary r29 r30 r23.outcome_1_bonds into r31;
    is.eq r2 2u8 into r32;
    add r23.outcome_2_bonds 1000000u128 into r33;
    ternary r32 r33 r23.outcome_2_bonds into r34;
    is.eq r2 3u8 into r35;
    add r23.outcome_3_bonds 1000000u128 into r36;
    ternary r35 r36 r23.outcome_3_bonds into r37;
    is.eq r2 4u8 into r38;
    add r23.outcome_4_bonds 1000000u128 into r39;
    ternary r38 r39 r23.outcome_4_bonds into r40;
    add r23.total_voters 1u8 into r41;
    add r23.total_bonded 1000000u128 into r42;
    cast r1 r31 r34 r37 r40 r41 r42 r25 0u64 false 0u8 into r43 as VoteTally;
    set r43 into vote_tallies[r1];
    cast r4.id r4.creator r4.resolver r4.question_hash r4.category r4.num_outcomes r4.deadline r4.resolution_deadline 5u8 r4.created_at r4.token_type into r44 as Market;
    set r44 into markets[r1];
    get.or_use program_credits[0u8] 0u128 into r45;
    add r45 1000000u128 into r46;
    set r46 into program_credits[0u8];

function finalize_votes:
    input r0 as field.public;
    async finalize_votes r0 into r1;
    output r1 as veiled_markets_usad_v12.aleo/finalize_votes.future;

finalize finalize_votes:
    input r0 as field.public;
    get markets[r0] into r1;
    is.eq r1.status 5u8 into r2;
    assert.eq r2 true;
    get vote_tallies[r0] into r3;
    not r3.finalized into r4;
    assert.eq r4 true;
    cast block.height into r5 as u64;
    gt r5 r3.voting_deadline into r6;
    assert.eq r6 true;
    gte r3.total_voters 3u8 into r7;
    assert.eq r7 true;
    gt r3.outcome_2_bonds r3.outcome_1_bonds into r8;
    ternary r8 r3.outcome_2_bonds r3.outcome_1_bonds into r9;
    ternary r8 2u8 1u8 into r10;
    gt r3.outcome_3_bonds r9 into r11;
    ternary r11 r3.outcome_3_bonds r9 into r12;
    ternary r11 3u8 r10 into r13;
    gt r3.outcome_4_bonds r12 into r14;
    ternary r14 4u8 r13 into r15;
    add r5 2880u64 into r16;
    cast r0 r3.outcome_1_bonds r3.outcome_2_bonds r3.outcome_3_bonds r3.outcome_4_bonds r3.total_voters r3.total_bonded r3.voting_deadline r16 false r15 into r17 as VoteTally;
    set r17 into vote_tallies[r0];
    cast r1.id r1.creator r1.resolver r1.question_hash r1.category r1.num_outcomes r1.deadline r1.resolution_deadline 6u8 r1.created_at r1.token_type into r18 as Market;
    set r18 into markets[r0];

function confirm_resolution:
    input r0 as field.public;
    async confirm_resolution r0 into r1;
    output r1 as veiled_markets_usad_v12.aleo/confirm_resolution.future;

finalize confirm_resolution:
    input r0 as field.public;
    get markets[r0] into r1;
    is.eq r1.status 6u8 into r2;
    assert.eq r2 true;
    get vote_tallies[r0] into r3;
    gte r3.winning_outcome 1u8 into r4;
    assert.eq r4 true;
    cast block.height into r5 as u64;
    gt r5 r3.dispute_deadline into r6;
    assert.eq r6 true;
    contains dispute_bonds[r0] into r7;
    not r7 into r8;
    assert.eq r8 true;
    get market_fees[r0] into r9;
    mul r9.protocol_fees 20u128 into r10;
    div r10 100u128 into r11;
    get.or_use voter_rewards[r1.resolver] 0u128 into r12;
    add r12 r11 into r13;
    set r13 into voter_rewards[r1.resolver];
    cast r0 r3.outcome_1_bonds r3.outcome_2_bonds r3.outcome_3_bonds r3.outcome_4_bonds r3.total_voters r3.total_bonded r3.voting_deadline r3.dispute_deadline true r3.winning_outcome into r14 as VoteTally;
    set r14 into vote_tallies[r0];
    cast r1.id r1.creator r1.resolver r1.question_hash r1.category r1.num_outcomes r1.deadline r1.resolution_deadline 3u8 r1.created_at r1.token_type into r15 as Market;
    set r15 into markets[r0];

function dispute_resolution:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as field.private;
    input r3 as credits.aleo/credits.record;
    input r4 as u128.private;
    gte r4 1000000u128 into r5;
    assert.eq r5 true;
    cast self.caller r0 r1 r4 r2 into r6 as DisputeBondReceipt.record;
    cast r4 into r7 as u64;
    call credits.aleo/transfer_private_to_public r3 veiled_markets_usad_v12.aleo r7 into r8 r9;
    async dispute_resolution r9 r0 r1 r4 self.caller into r10;
    output r6 as DisputeBondReceipt.record;
    output r8 as credits.aleo/credits.record;
    output r10 as veiled_markets_usad_v12.aleo/dispute_resolution.future;

finalize dispute_resolution:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u128.public;
    input r4 as address.public;
    await r0;
    get markets[r1] into r5;
    is.eq r5.status 6u8 into r6;
    assert.eq r6 true;
    get vote_tallies[r1] into r7;
    gte r7.winning_outcome 1u8 into r8;
    assert.eq r8 true;
    cast block.height into r9 as u64;
    lte r9 r7.dispute_deadline into r10;
    assert.eq r10 true;
    is.neq r2 r7.winning_outcome into r11;
    assert.eq r11 true;
    gte r2 1u8 into r12;
    lte r2 r5.num_outcomes into r13;
    and r12 r13 into r14;
    assert.eq r14 true;
    mul r7.total_bonded 3u128 into r15;
    gte r3 r15 into r16;
    assert.eq r16 true;
    contains dispute_bonds[r1] into r17;
    not r17 into r18;
    assert.eq r18 true;
    set r3 into dispute_bonds[r1];
    cast r1 r7.outcome_1_bonds r7.outcome_2_bonds r7.outcome_3_bonds r7.outcome_4_bonds r7.total_voters r7.total_bonded r7.voting_deadline r7.dispute_deadline true r2 into r19 as VoteTally;
    set r19 into vote_tallies[r1];
    cast r5.id r5.creator r4 r5.question_hash r5.category r5.num_outcomes r5.deadline r5.resolution_deadline 3u8 r5.created_at r5.token_type into r20 as Market;
    set r20 into markets[r1];
    get.or_use program_credits[0u8] 0u128 into r21;
    add r21 r3 into r22;
    set r22 into program_credits[0u8];

function cancel_market:
    input r0 as field.public;
    async cancel_market r0 self.caller into r1;
    output r1 as veiled_markets_usad_v12.aleo/cancel_market.future;

finalize cancel_market:
    input r0 as field.public;
    input r1 as address.public;
    get markets[r0] into r2;
    cast block.height into r3 as u64;
    is.eq r2.creator r1 into r4;
    is.eq r2.status 1u8 into r5;
    and r4 r5 into r6;
    gt r3 r2.resolution_deadline into r7;
    is.neq r2.status 3u8 into r8;
    and r7 r8 into r9;
    is.neq r2.status 4u8 into r10;
    and r9 r10 into r11;
    or r6 r11 into r12;
    assert.eq r12 true;
    get amm_pools[r0] into r13;
    not r6 into r14;
    is.eq r13.total_volume 0u128 into r15;
    or r14 r15 into r16;
    assert.eq r16 true;
    remove vote_tallies[r0];
    cast r2.id r2.creator r2.resolver r2.question_hash r2.category r2.num_outcomes r2.deadline r2.resolution_deadline 4u8 r2.created_at r2.token_type into r17 as Market;
    set r17 into markets[r0];

function claim_voter_bond:
    input r0 as VoterBondReceipt.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    gt r0.bond_amount 0u128 into r2;
    assert.eq r2 true;
    cast r0.market_id self.caller r0.bond_nonce into r3 as BondClaimKey;
    hash.bhp256 r3 into r4 as field;
    cast r0.bond_amount into r5 as u64;
    call credits.aleo/transfer_public_to_private self.caller r5 into r6 r7;
    async claim_voter_bond r7 r4 r0.market_id r0.bond_amount r0.voted_outcome into r8;
    output r6 as credits.aleo/credits.record;
    output r8 as veiled_markets_usad_v12.aleo/claim_voter_bond.future;

finalize claim_voter_bond:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u8.public;
    await r0;
    get markets[r2] into r5;
    is.eq r5.status 3u8 into r6;
    is.eq r5.status 4u8 into r7;
    or r6 r7 into r8;
    assert.eq r8 true;
    contains vote_tallies[r2] into r9;
    get vote_tallies[r2] into r10;
    is.eq r10.winning_outcome r4 into r11;
    ternary r9 r11 false into r12;
    or r7 r12 into r13;
    assert.eq r13 true;
    get.or_use bond_claimed[r1] false into r14;
    not r14 into r15;
    assert.eq r15 true;
    set true into bond_claimed[r1];
    get.or_use program_credits[0u8] 0u128 into r16;
    gte r16 r3 into r17;
    assert.eq r17 true;
    sub r16 r3 into r18;
    set r18 into program_credits[0u8];

function claim_dispute_bond:
    input r0 as DisputeBondReceipt.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    gt r0.bond_amount 0u128 into r2;
    assert.eq r2 true;
    cast r0.market_id self.caller r0.dispute_nonce into r3 as BondClaimKey;
    hash.bhp256 r3 into r4 as field;
    cast r0.bond_amount into r5 as u64;
    call credits.aleo/transfer_public_to_private self.caller r5 into r6 r7;
    async claim_dispute_bond r7 r4 r0.market_id r0.bond_amount r0.proposed_outcome into r8;
    output r6 as credits.aleo/credits.record;
    output r8 as veiled_markets_usad_v12.aleo/claim_dispute_bond.future;

finalize claim_dispute_bond:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u8.public;
    await r0;
    get markets[r2] into r5;
    is.eq r5.status 3u8 into r6;
    is.eq r5.status 4u8 into r7;
    or r6 r7 into r8;
    assert.eq r8 true;
    contains vote_tallies[r2] into r9;
    get vote_tallies[r2] into r10;
    is.eq r10.winning_outcome r4 into r11;
    ternary r9 r11 false into r12;
    or r7 r12 into r13;
    assert.eq r13 true;
    get.or_use bond_claimed[r1] false into r14;
    not r14 into r15;
    assert.eq r15 true;
    set true into bond_claimed[r1];
    get.or_use program_credits[0u8] 0u128 into r16;
    gte r16 r3 into r17;
    assert.eq r17 true;
    sub r16 r3 into r18;
    set r18 into program_credits[0u8];

function redeem_shares_usad:
    input r0 as OutcomeShare.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    is.eq r0.token_type 3u8 into r2;
    assert.eq r2 true;
    gt r0.quantity 0u128 into r3;
    assert.eq r3 true;
    cast r0.market_id self.caller r0.share_nonce into r4 as ShareClaimKey;
    hash.bhp256 r4 into r5 as field;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r0.quantity into r6 r7 r8;
    async redeem_shares_usad r8 r5 r0.market_id r0.outcome r0.quantity into r9;
    output r6 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r7 as test_usad_stablecoin.aleo/Token.record;
    output r9 as veiled_markets_usad_v12.aleo/redeem_shares_usad.future;

finalize redeem_shares_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u128.public;
    await r0;
    get markets[r2] into r5;
    is.eq r5.status 3u8 into r6;
    assert.eq r6 true;
    is.eq r5.token_type 3u8 into r7;
    assert.eq r7 true;
    get vote_tallies[r2] into r8;
    assert.eq r8.finalized true;
    is.eq r3 r8.winning_outcome into r9;
    assert.eq r9 true;
    get.or_use share_redeemed[r1] false into r10;
    not r10 into r11;
    assert.eq r11 true;
    set true into share_redeemed[r1];
    get.or_use market_credits[r2] 0u128 into r12;
    gte r12 r4 into r13;
    assert.eq r13 true;
    sub r12 r4 into r14;
    set r14 into market_credits[r2];
    get.or_use program_credits[2u8] 0u128 into r15;
    gte r15 r4 into r16;
    assert.eq r16 true;
    sub r15 r4 into r17;
    set r17 into program_credits[2u8];

function claim_refund_usad:
    input r0 as OutcomeShare.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    is.eq r0.token_type 3u8 into r2;
    assert.eq r2 true;
    gt r0.quantity 0u128 into r3;
    assert.eq r3 true;
    cast r0.market_id self.caller r0.share_nonce into r4 as ShareClaimKey;
    hash.bhp256 r4 into r5 as field;
    cast self.caller r0.market_id r0.quantity r0.share_nonce 3u8 into r6 as RefundClaim.record;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r0.quantity into r7 r8 r9;
    async claim_refund_usad r9 r5 r0.market_id r0.quantity into r10;
    output r6 as RefundClaim.record;
    output r7 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r8 as test_usad_stablecoin.aleo/Token.record;
    output r10 as veiled_markets_usad_v12.aleo/claim_refund_usad.future;

finalize claim_refund_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    await r0;
    get markets[r2] into r4;
    is.eq r4.status 4u8 into r5;
    assert.eq r5 true;
    is.eq r4.token_type 3u8 into r6;
    assert.eq r6 true;
    get.or_use share_redeemed[r1] false into r7;
    not r7 into r8;
    assert.eq r8 true;
    set true into share_redeemed[r1];
    get.or_use market_credits[r2] 0u128 into r9;
    gte r9 r3 into r10;
    assert.eq r10 true;
    sub r9 r3 into r11;
    set r11 into market_credits[r2];
    get.or_use program_credits[2u8] 0u128 into r12;
    gte r12 r3 into r13;
    assert.eq r13 true;
    sub r12 r3 into r14;
    set r14 into program_credits[2u8];

function claim_lp_refund_usad:
    input r0 as LPToken.record;
    input r1 as u128.private;
    is.eq r0.owner self.caller into r2;
    assert.eq r2 true;
    is.eq r0.token_type 3u8 into r3;
    assert.eq r3 true;
    gt r0.lp_shares 0u128 into r4;
    assert.eq r4 true;
    gt r1 0u128 into r5;
    assert.eq r5 true;
    cast r0.market_id self.caller r0.lp_nonce into r6 as LPClaimKey;
    hash.bhp256 r6 into r7 as field;
    cast self.caller r0.market_id r1 r0.lp_nonce 3u8 into r8 as RefundClaim.record;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r1 into r9 r10 r11;
    async claim_lp_refund_usad r11 r7 r0.market_id r0.lp_shares r1 into r12;
    output r8 as RefundClaim.record;
    output r9 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r10 as test_usad_stablecoin.aleo/Token.record;
    output r12 as veiled_markets_usad_v12.aleo/claim_lp_refund_usad.future;

finalize claim_lp_refund_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    await r0;
    get markets[r2] into r5;
    is.eq r5.status 4u8 into r6;
    assert.eq r6 true;
    is.eq r5.token_type 3u8 into r7;
    assert.eq r7 true;
    get.or_use lp_positions[r1] false into r8;
    not r8 into r9;
    assert.eq r9 true;
    set true into lp_positions[r1];
    get amm_pools[r2] into r10;
    add r10.reserve_1 r10.reserve_2 into r11;
    add r11 r10.reserve_3 into r12;
    add r12 r10.reserve_4 into r13;
    gt r13 0u128 into r14;
    assert.eq r14 true;
    mul r3 r13 into r15;
    div r15 r10.total_lp_shares into r16;
    gte r16 r4 into r17;
    assert.eq r17 true;
    gt r4 0u128 into r18;
    assert.eq r18 true;
    get.or_use market_credits[r2] 0u128 into r19;
    gte r19 r4 into r20;
    assert.eq r20 true;
    sub r19 r4 into r21;
    set r21 into market_credits[r2];
    get.or_use program_credits[2u8] 0u128 into r22;
    gte r22 r4 into r23;
    assert.eq r23 true;
    sub r22 r4 into r24;
    set r24 into program_credits[2u8];
    sub r10.total_liquidity r4 into r25;
    sub r10.total_lp_shares r3 into r26;
    cast r2 r10.reserve_1 r10.reserve_2 r10.reserve_3 r10.reserve_4 r25 r26 r10.total_volume into r27 as AMMPool;
    set r27 into amm_pools[r2];

function withdraw_lp_resolved_usad:
    input r0 as LPToken.record;
    input r1 as u128.private;
    is.eq r0.owner self.caller into r2;
    assert.eq r2 true;
    is.eq r0.token_type 3u8 into r3;
    assert.eq r3 true;
    gt r0.lp_shares 0u128 into r4;
    assert.eq r4 true;
    gt r1 0u128 into r5;
    assert.eq r5 true;
    cast r0.market_id self.caller r0.lp_nonce into r6 as LPClaimKey;
    hash.bhp256 r6 into r7 as field;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r1 into r8 r9 r10;
    async withdraw_lp_resolved_usad r10 r7 r0.market_id r0.lp_shares r1 into r11;
    output r8 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r9 as test_usad_stablecoin.aleo/Token.record;
    output r11 as veiled_markets_usad_v12.aleo/withdraw_lp_resolved_usad.future;

finalize withdraw_lp_resolved_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    await r0;
    get markets[r2] into r5;
    is.eq r5.status 3u8 into r6;
    assert.eq r6 true;
    is.eq r5.token_type 3u8 into r7;
    assert.eq r7 true;
    get vote_tallies[r2] into r8;
    assert.eq r8.finalized true;
    cast block.height into r9 as u64;
    add r8.dispute_deadline 2880u64 into r10;
    gt r9 r10 into r11;
    assert.eq r11 true;
    get.or_use lp_positions[r1] false into r12;
    not r12 into r13;
    assert.eq r13 true;
    set true into lp_positions[r1];
    get amm_pools[r2] into r14;
    get.or_use market_credits[r2] 0u128 into r15;
    mul r3 r15 into r16;
    div r16 r14.total_lp_shares into r17;
    gte r17 r4 into r18;
    assert.eq r18 true;
    gt r17 0u128 into r19;
    assert.eq r19 true;
    sub r15 r17 into r20;
    set r20 into market_credits[r2];
    get.or_use program_credits[2u8] 0u128 into r21;
    gte r21 r17 into r22;
    assert.eq r22 true;
    sub r21 r17 into r23;
    set r23 into program_credits[2u8];
    sub r14.total_lp_shares r3 into r24;
    cast r2 r14.reserve_1 r14.reserve_2 r14.reserve_3 r14.reserve_4 r14.total_liquidity r24 r14.total_volume into r25 as AMMPool;
    set r25 into amm_pools[r2];

function withdraw_fees_usad:
    input r0 as field.public;
    input r1 as u128.private;
    call test_usad_stablecoin.aleo/transfer_public_to_private self.caller r1 into r2 r3 r4;
    async withdraw_fees_usad r4 r0 self.caller r1 into r5;
    output r2 as test_usad_stablecoin.aleo/ComplianceRecord.record;
    output r3 as test_usad_stablecoin.aleo/Token.record;
    output r5 as veiled_markets_usad_v12.aleo/withdraw_fees_usad.future;

finalize withdraw_fees_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as u128.public;
    await r0;
    get markets[r1] into r4;
    is.eq r4.creator r2 into r5;
    assert.eq r5 true;
    is.eq r4.status 3u8 into r6;
    assert.eq r6 true;
    is.eq r4.token_type 3u8 into r7;
    assert.eq r7 true;
    get vote_tallies[r1] into r8;
    assert.eq r8.finalized true;
    cast block.height into r9 as u64;
    add r8.dispute_deadline 2880u64 into r10;
    gt r9 r10 into r11;
    assert.eq r11 true;
    get.or_use creator_fees_claimed[r1] false into r12;
    not r12 into r13;
    assert.eq r13 true;
    set true into creator_fees_claimed[r1];
    get market_fees[r1] into r14;
    gte r14.creator_fees r3 into r15;
    assert.eq r15 true;
    get.or_use market_credits[r1] 0u128 into r16;
    gte r16 r3 into r17;
    assert.eq r17 true;
    sub r16 r3 into r18;
    set r18 into market_credits[r1];
    get.or_use program_credits[2u8] 0u128 into r19;
    gte r19 r3 into r20;
    assert.eq r20 true;
    sub r19 r3 into r21;
    set r21 into program_credits[2u8];

function init_multisig:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u8.public;
    is.eq self.caller aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8 into r4;
    assert.eq r4 true;
    async init_multisig r0 r1 r2 r3 into r5;
    output r5 as veiled_markets_usad_v12.aleo/init_multisig.future;

finalize init_multisig:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u8.public;
    contains multisig_config[0u8] into r4;
    not r4 into r5;
    assert.eq r5 true;
    gte r3 2u8 into r6;
    lte r3 3u8 into r7;
    and r6 r7 into r8;
    assert.eq r8 true;
    is.neq r0 r1 into r9;
    is.neq r0 r2 into r10;
    and r9 r10 into r11;
    is.neq r1 r2 into r12;
    and r11 r12 into r13;
    assert.eq r13 true;
    cast r0 r1 r2 r3 into r14 as SignerConfig;
    set r14 into multisig_config[0u8];

function propose_treasury_withdrawal:
    input r0 as u128.public;
    input r1 as address.public;
    input r2 as u8.public;
    input r3 as u64.public;
    cast self.caller 1u8 r0 r1 r2 r3 into r4 as ProposalSeed;
    hash.bhp256 r4 into r5 as field;
    async propose_treasury_withdrawal r5 self.caller r0 r1 r2 into r6;
    output r5 as field.private;
    output r6 as veiled_markets_usad_v12.aleo/propose_treasury_withdrawal.future;

finalize propose_treasury_withdrawal:
    input r0 as field.public;
    input r1 as address.public;
    input r2 as u128.public;
    input r3 as address.public;
    input r4 as u8.public;
    get multisig_config[0u8] into r5;
    is.eq r1 r5.signer_1 into r6;
    is.eq r1 r5.signer_2 into r7;
    or r6 r7 into r8;
    is.eq r1 r5.signer_3 into r9;
    or r8 r9 into r10;
    assert.eq r10 true;
    contains multisig_proposals[r0] into r11;
    not r11 into r12;
    assert.eq r12 true;
    is.eq r4 3u8 into r13;
    ternary r13 2u8 0u8 into r14;
    get.or_use protocol_treasury[r14] 0u128 into r15;
    gte r15 r2 into r16;
    assert.eq r16 true;
    cast block.height into r17 as u64;
    cast r0 1u8 r2 r3 r4 r17 into r18 as MultiSigProposal;
    set r18 into multisig_proposals[r0];
    cast r0 r1 into r19 as ApprovalKey;
    hash.bhp256 r19 into r20 as field;
    set true into multisig_approvals[r20];

function approve_proposal:
    input r0 as field.public;
    async approve_proposal r0 self.caller into r1;
    output r1 as veiled_markets_usad_v12.aleo/approve_proposal.future;

finalize approve_proposal:
    input r0 as field.public;
    input r1 as address.public;
    get multisig_config[0u8] into r2;
    is.eq r1 r2.signer_1 into r3;
    is.eq r1 r2.signer_2 into r4;
    or r3 r4 into r5;
    is.eq r1 r2.signer_3 into r6;
    or r5 r6 into r7;
    assert.eq r7 true;
    get multisig_proposals[r0] into r8;
    cast r0 r1 into r9 as ApprovalKey;
    hash.bhp256 r9 into r10 as field;
    get.or_use multisig_approvals[r10] false into r11;
    not r11 into r12;
    assert.eq r12 true;
    set true into multisig_approvals[r10];

function exec_proposal_usad:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    call test_usad_stablecoin.aleo/transfer_public r2 r1 into r3;
    async exec_proposal_usad r3 r0 r1 r2 into r4;
    output r4 as veiled_markets_usad_v12.aleo/exec_proposal_usad.future;

finalize exec_proposal_usad:
    input r0 as test_usad_stablecoin.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as address.public;
    await r0;
    get multisig_config[0u8] into r4;
    get multisig_proposals[r1] into r5;
    is.eq r5.token_type 3u8 into r6;
    assert.eq r6 true;
    is.eq r5.amount r2 into r7;
    assert.eq r7 true;
    is.eq r5.recipient r3 into r8;
    assert.eq r8 true;
    cast r1 r4.signer_1 into r9 as ApprovalKey;
    hash.bhp256 r9 into r10 as field;
    cast r1 r4.signer_2 into r11 as ApprovalKey;
    hash.bhp256 r11 into r12 as field;
    cast r1 r4.signer_3 into r13 as ApprovalKey;
    hash.bhp256 r13 into r14 as field;
    get.or_use multisig_approvals[r10] false into r15;
    ternary r15 1u8 0u8 into r16;
    get.or_use multisig_approvals[r12] false into r17;
    ternary r17 1u8 0u8 into r18;
    get.or_use multisig_approvals[r14] false into r19;
    ternary r19 1u8 0u8 into r20;
    add r16 r18 into r21;
    add r21 r20 into r22;
    gte r22 r4.threshold into r23;
    assert.eq r23 true;
    get.or_use protocol_treasury[2u8] 0u128 into r24;
    gte r24 r2 into r25;
    assert.eq r25 true;
    sub r24 r2 into r26;
    set r26 into protocol_treasury[2u8];
    get.or_use program_credits[2u8] 0u128 into r27;
    gte r27 r2 into r28;
    assert.eq r28 true;
    sub r27 r2 into r29;
    set r29 into program_credits[2u8];
    remove multisig_proposals[r1];
    remove multisig_approvals[r10];
    remove multisig_approvals[r12];
    remove multisig_approvals[r14];

function claim_voter_reward:
    input r0 as u64.public;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    call credits.aleo/transfer_public_to_private self.caller r0 into r2 r3;
    cast r0 into r4 as u128;
    async claim_voter_reward r3 self.caller r4 into r5;
    output r2 as credits.aleo/credits.record;
    output r5 as veiled_markets_usad_v12.aleo/claim_voter_reward.future;

finalize claim_voter_reward:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as address.public;
    input r2 as u128.public;
    await r0;
    get.or_use voter_rewards[r1] 0u128 into r3;
    gt r3 0u128 into r4;
    assert.eq r4 true;
    is.eq r3 r2 into r5;
    assert.eq r5 true;
    set 0u128 into voter_rewards[r1];
    get.or_use program_credits[0u8] 0u128 into r6;
    gte r6 r3 into r7;
    assert.eq r7 true;
    sub r6 r3 into r8;
    set r8 into program_credits[0u8];

constructor:
    assert.eq edition 0u16;
