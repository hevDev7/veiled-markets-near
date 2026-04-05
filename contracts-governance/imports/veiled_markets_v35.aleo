import credits.aleo;
program veiled_markets_v35.aleo;

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
    output r2 as veiled_markets_v35.aleo/set_governance_value.future;

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

function create_market:
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
    cast self.caller r12 r6 r14 1u8 into r15 as LPToken.record;
    cast r6 into r16 as u64;
    call credits.aleo/transfer_public_as_signer veiled_markets_v35.aleo r16 into r17;
    async create_market r17 r12 self.caller r0 r1 r2 r3 r4 r5 r6 1u8 into r18;
    output r12 as field.private;
    output r15 as LPToken.record;
    output r18 as veiled_markets_v35.aleo/create_market.future;

finalize create_market:
    input r0 as credits.aleo/transfer_public_as_signer.future;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as field.public;
    input r4 as u8.public;
    input r5 as u8.public;
    input r6 as u64.public;
    input r7 as u64.public;
    input r8 as address.public;
    input r9 as u128.public;
    input r10 as u8.public;
    await r0;
    contains markets[r1] into r11;
    not r11 into r12;
    assert.eq r12 true;
    cast block.height into r13 as u64;
    get.or_use governance_values[6field] 0u128 into r14;
    is.eq r14 0u128 into r15;
    assert.eq r15 true;
    get.or_use governance_values[5field] 10000u128 into r16;
    gte r9 r16 into r17;
    assert.eq r17 true;
    gt r6 r13 into r18;
    assert.eq r18 true;
    gt r7 r6 into r19;
    assert.eq r19 true;
    cast r1 r2 r8 r3 r4 r5 r6 r7 1u8 r13 r10 into r20 as Market;
    cast r5 into r21 as u128;
    div r9 r21 into r22;
    gte r5 3u8 into r23;
    ternary r23 r22 0u128 into r24;
    gte r5 4u8 into r25;
    ternary r25 r22 0u128 into r26;
    cast r1 r22 r22 r24 r26 r9 r9 0u128 into r27 as AMMPool;
    set r20 into markets[r1];
    set r27 into amm_pools[r1];
    cast r1 0u128 0u128 into r28 as MarketFees;
    set r28 into market_fees[r1];
    is.eq r10 1u8 into r29;
    ternary r29 0u8 1u8 into r30;
    get.or_use program_credits[r30] 0u128 into r31;
    add r31 r9 into r32;
    set r32 into program_credits[r30];
    set r9 into market_credits[r1];

function buy_shares_private:
    input r0 as field.private;
    input r1 as u8.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as field.private;
    input r6 as credits.aleo/credits.record;
    gte r1 1u8 into r7;
    lte r1 4u8 into r8;
    and r7 r8 into r9;
    assert.eq r9 true;
    gte r2 1000u128 into r10;
    assert.eq r10 true;
    cast self.caller r0 r1 r3 r5 1u8 into r11 as OutcomeShare.record;
    cast r2 into r12 as u64;
    call credits.aleo/transfer_private_to_public r6 veiled_markets_v35.aleo r12 into r13 r14;
    async buy_shares_private r14 r0 r1 r2 r3 r4 1u8 into r15;
    output r11 as OutcomeShare.record;
    output r13 as credits.aleo/credits.record;
    output r15 as veiled_markets_v35.aleo/buy_shares_private.future;

finalize buy_shares_private:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u8.public;
    await r0;
    get markets[r1] into r7;
    is.eq r7.status 1u8 into r8;
    assert.eq r8 true;
    is.eq r7.token_type r6 into r9;
    assert.eq r9 true;
    gte r2 1u8 into r10;
    lte r2 r7.num_outcomes into r11;
    and r10 r11 into r12;
    assert.eq r12 true;
    cast block.height into r13 as u64;
    get.or_use governance_values[4field] 1000u128 into r14;
    gte r3 r14 into r15;
    assert.eq r15 true;
    lte r13 r7.deadline into r16;
    assert.eq r16 true;
    get.or_use governance_values[6field] 0u128 into r17;
    is.eq r17 0u128 into r18;
    assert.eq r18 true;
    get.or_use governance_values[1field] 50u128 into r19;
    get.or_use governance_values[2field] 50u128 into r20;
    mul r3 r19 into r21;
    div r21 10000u128 into r22;
    mul r3 r20 into r23;
    div r23 10000u128 into r24;
    sub r3 r22 into r25;
    sub r25 r24 into r26;
    get market_fees[r1] into r27;
    add r27.protocol_fees r22 into r28;
    add r27.creator_fees r24 into r29;
    cast r1 r28 r29 into r30 as MarketFees;
    set r30 into market_fees[r1];
    is.eq r6 1u8 into r31;
    ternary r31 0u8 1u8 into r32;
    get.or_use protocol_treasury[r32] 0u128 into r33;
    add r33 r22 into r34;
    set r34 into protocol_treasury[r32];
    get amm_pools[r1] into r35;
    is.eq r2 1u8 into r36;
    is.eq r2 2u8 into r37;
    is.eq r2 3u8 into r38;
    ternary r38 r35.reserve_3 r35.reserve_4 into r39;
    ternary r37 r35.reserve_2 r39 into r40;
    ternary r36 r35.reserve_1 r40 into r41;
    is.neq r2 1u8 into r42;
    mul r41 r35.reserve_1 into r43;
    add r35.reserve_1 r26 into r44;
    div r43 r44 into r45;
    ternary r42 r45 r41 into r46;
    is.neq r2 2u8 into r47;
    mul r46 r35.reserve_2 into r48;
    add r35.reserve_2 r26 into r49;
    div r48 r49 into r50;
    ternary r47 r50 r46 into r51;
    is.neq r2 3u8 into r52;
    gte r7.num_outcomes 3u8 into r53;
    and r52 r53 into r54;
    mul r51 r35.reserve_3 into r55;
    add r35.reserve_3 r26 into r56;
    div r55 r56 into r57;
    ternary r54 r57 r51 into r58;
    is.neq r2 4u8 into r59;
    gte r7.num_outcomes 4u8 into r60;
    and r59 r60 into r61;
    mul r58 r35.reserve_4 into r62;
    add r35.reserve_4 r26 into r63;
    div r62 r63 into r64;
    ternary r61 r64 r58 into r65;
    add r41 r26 into r66;
    sub r66 r65 into r67;
    gte r67 r5 into r68;
    assert.eq r68 true;
    gte r67 r4 into r69;
    assert.eq r69 true;
    gt r67 0u128 into r70;
    assert.eq r70 true;
    ternary r36 r65 r44 into r71;
    ternary r37 r65 r49 into r72;
    ternary r38 r65 r56 into r73;
    ternary r53 r73 0u128 into r74;
    is.eq r2 4u8 into r75;
    ternary r75 r65 r63 into r76;
    ternary r60 r76 0u128 into r77;
    add r35.total_liquidity r26 into r78;
    add r35.total_volume r3 into r79;
    cast r1 r71 r72 r74 r77 r78 r35.total_lp_shares r79 into r80 as AMMPool;
    set r80 into amm_pools[r1];
    get.or_use program_credits[r32] 0u128 into r81;
    add r81 r3 into r82;
    set r82 into program_credits[r32];
    get.or_use market_credits[r1] 0u128 into r83;
    add r83 r3 into r84;
    set r84 into market_credits[r1];

function sell_shares:
    input r0 as OutcomeShare.record;
    input r1 as u128.private;
    input r2 as u128.private;
    is.eq r0.owner self.caller into r3;
    assert.eq r3 true;
    is.eq r0.token_type 1u8 into r4;
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
    cast r14 into r15 as u64;
    call credits.aleo/transfer_public_to_private self.caller r15 into r16 r17;
    sub r0.quantity r2 into r18;
    cast self.caller r0.market_id r0.outcome r18 r0.share_nonce 1u8 into r19 as OutcomeShare.record;
    async sell_shares r17 r0.market_id r0.outcome r1 r2 1u8 into r20;
    output r19 as OutcomeShare.record;
    output r16 as credits.aleo/credits.record;
    output r20 as veiled_markets_v35.aleo/sell_shares.future;

finalize sell_shares:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as u8.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u8.public;
    await r0;
    get markets[r1] into r6;
    is.eq r6.status 1u8 into r7;
    assert.eq r7 true;
    is.eq r6.token_type r5 into r8;
    assert.eq r8 true;
    gte r2 1u8 into r9;
    lte r2 r6.num_outcomes into r10;
    and r9 r10 into r11;
    assert.eq r11 true;
    cast block.height into r12 as u64;
    get.or_use governance_values[6field] 0u128 into r13;
    is.eq r13 0u128 into r14;
    assert.eq r14 true;
    get.or_use governance_values[4field] 1000u128 into r15;
    gte r3 r15 into r16;
    assert.eq r16 true;
    lte r12 r6.deadline into r17;
    assert.eq r17 true;
    mul r3 50u128 into r18;
    div r18 10000u128 into r19;
    mul r3 100u128 into r20;
    div r20 10000u128 into r21;
    sub r3 r19 into r22;
    sub r22 r19 into r23;
    sub r23 r21 into r24;
    sub r3 r21 into r25;
    get market_fees[r1] into r26;
    add r26.protocol_fees r19 into r27;
    add r26.creator_fees r19 into r28;
    cast r1 r27 r28 into r29 as MarketFees;
    set r29 into market_fees[r1];
    is.eq r5 1u8 into r30;
    ternary r30 0u8 1u8 into r31;
    get.or_use protocol_treasury[r31] 0u128 into r32;
    add r32 r19 into r33;
    set r33 into protocol_treasury[r31];
    get amm_pools[r1] into r34;
    is.eq r2 1u8 into r35;
    is.eq r2 2u8 into r36;
    is.eq r2 3u8 into r37;
    ternary r37 r34.reserve_3 r34.reserve_4 into r38;
    ternary r36 r34.reserve_2 r38 into r39;
    ternary r35 r34.reserve_1 r39 into r40;
    is.neq r2 1u8 into r41;
    ternary r41 r25 0u128 into r42;
    gte r34.reserve_1 r42 into r43;
    assert.eq r43 true;
    sub r34.reserve_1 r42 into r44;
    mul r40 r34.reserve_1 into r45;
    div r45 r44 into r46;
    ternary r41 r46 r40 into r47;
    is.neq r2 2u8 into r48;
    ternary r48 r25 0u128 into r49;
    gte r34.reserve_2 r49 into r50;
    assert.eq r50 true;
    sub r34.reserve_2 r49 into r51;
    mul r47 r34.reserve_2 into r52;
    div r52 r51 into r53;
    ternary r48 r53 r47 into r54;
    is.neq r2 3u8 into r55;
    gte r6.num_outcomes 3u8 into r56;
    and r55 r56 into r57;
    ternary r57 r25 0u128 into r58;
    gte r34.reserve_3 r58 into r59;
    assert.eq r59 true;
    sub r34.reserve_3 r58 into r60;
    is.eq r60 0u128 into r61;
    ternary r61 1u128 r60 into r62;
    mul r54 r34.reserve_3 into r63;
    div r63 r62 into r64;
    ternary r57 r64 r54 into r65;
    is.neq r2 4u8 into r66;
    gte r6.num_outcomes 4u8 into r67;
    and r66 r67 into r68;
    ternary r68 r25 0u128 into r69;
    gte r34.reserve_4 r69 into r70;
    assert.eq r70 true;
    sub r34.reserve_4 r69 into r71;
    is.eq r71 0u128 into r72;
    ternary r72 1u128 r71 into r73;
    mul r65 r34.reserve_4 into r74;
    div r74 r73 into r75;
    ternary r68 r75 r65 into r76;
    sub r76 r40 into r77;
    add r77 r25 into r78;
    lte r78 r4 into r79;
    assert.eq r79 true;
    gt r78 0u128 into r80;
    assert.eq r80 true;
    ternary r35 r76 r44 into r81;
    ternary r36 r76 r51 into r82;
    ternary r37 r76 r60 into r83;
    ternary r56 r83 0u128 into r84;
    is.eq r2 4u8 into r85;
    ternary r85 r76 r71 into r86;
    ternary r67 r86 0u128 into r87;
    sub r34.total_liquidity r25 into r88;
    add r34.total_volume r3 into r89;
    cast r1 r81 r82 r84 r87 r88 r34.total_lp_shares r89 into r90 as AMMPool;
    set r90 into amm_pools[r1];
    get.or_use market_credits[r1] 0u128 into r91;
    gte r91 r25 into r92;
    assert.eq r92 true;
    sub r91 r25 into r93;
    set r93 into market_credits[r1];
    get.or_use program_credits[r31] 0u128 into r94;
    gte r94 r24 into r95;
    assert.eq r95 true;
    sub r94 r24 into r96;
    set r96 into program_credits[r31];

function add_liquidity:
    input r0 as field.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as field.private;
    input r4 as credits.aleo/credits.record;
    gte r1 10000u128 into r5;
    assert.eq r5 true;
    cast self.caller r0 r2 r3 1u8 into r6 as LPToken.record;
    cast r1 into r7 as u64;
    call credits.aleo/transfer_private_to_public r4 veiled_markets_v35.aleo r7 into r8 r9;
    async add_liquidity r9 r0 r1 r2 1u8 into r10;
    output r6 as LPToken.record;
    output r8 as credits.aleo/credits.record;
    output r10 as veiled_markets_v35.aleo/add_liquidity.future;

finalize add_liquidity:
    input r0 as credits.aleo/transfer_private_to_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u8.public;
    await r0;
    get markets[r1] into r5;
    is.eq r5.status 1u8 into r6;
    assert.eq r6 true;
    is.eq r5.token_type r4 into r7;
    assert.eq r7 true;
    cast block.height into r8 as u64;
    get.or_use governance_values[6field] 0u128 into r9;
    is.eq r9 0u128 into r10;
    assert.eq r10 true;
    get.or_use governance_values[5field] 10000u128 into r11;
    gte r2 r11 into r12;
    assert.eq r12 true;
    lte r8 r5.deadline into r13;
    assert.eq r13 true;
    get amm_pools[r1] into r14;
    add r14.reserve_1 r14.reserve_2 into r15;
    add r15 r14.reserve_3 into r16;
    add r16 r14.reserve_4 into r17;
    gt r17 0u128 into r18;
    assert.eq r18 true;
    mul r2 r14.total_lp_shares into r19;
    div r19 r17 into r20;
    gte r20 r3 into r21;
    assert.eq r21 true;
    gt r3 0u128 into r22;
    assert.eq r22 true;
    mul r2 r14.reserve_1 into r23;
    div r23 r17 into r24;
    mul r2 r14.reserve_2 into r25;
    div r25 r17 into r26;
    mul r2 r14.reserve_3 into r27;
    div r27 r17 into r28;
    sub r2 r24 into r29;
    sub r29 r26 into r30;
    sub r30 r28 into r31;
    add r14.reserve_1 r24 into r32;
    add r14.reserve_2 r26 into r33;
    add r14.reserve_3 r28 into r34;
    add r14.reserve_4 r31 into r35;
    add r14.total_liquidity r2 into r36;
    add r14.total_lp_shares r3 into r37;
    cast r1 r32 r33 r34 r35 r36 r37 r14.total_volume into r38 as AMMPool;
    set r38 into amm_pools[r1];
    is.eq r4 1u8 into r39;
    ternary r39 0u8 1u8 into r40;
    get.or_use program_credits[r40] 0u128 into r41;
    add r41 r2 into r42;
    set r42 into program_credits[r40];
    get.or_use market_credits[r1] 0u128 into r43;
    add r43 r2 into r44;
    set r44 into market_credits[r1];

function close_market:
    input r0 as field.public;
    async close_market r0 into r1;
    output r1 as veiled_markets_v35.aleo/close_market.future;

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
    call credits.aleo/transfer_private_to_public r3 veiled_markets_v35.aleo 1000000u64 into r5 r6;
    async vote_outcome r6 r0 r1 self.caller into r7;
    output r4 as VoterBondReceipt.record;
    output r5 as credits.aleo/credits.record;
    output r7 as veiled_markets_v35.aleo/vote_outcome.future;

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
    output r1 as veiled_markets_v35.aleo/finalize_votes.future;

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
    output r1 as veiled_markets_v35.aleo/confirm_resolution.future;

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
    call credits.aleo/transfer_private_to_public r3 veiled_markets_v35.aleo r7 into r8 r9;
    async dispute_resolution r9 r0 r1 r4 self.caller into r10;
    output r6 as DisputeBondReceipt.record;
    output r8 as credits.aleo/credits.record;
    output r10 as veiled_markets_v35.aleo/dispute_resolution.future;

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
    output r1 as veiled_markets_v35.aleo/cancel_market.future;

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
    output r8 as veiled_markets_v35.aleo/claim_voter_bond.future;

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
    output r8 as veiled_markets_v35.aleo/claim_dispute_bond.future;

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

function redeem_shares:
    input r0 as OutcomeShare.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    is.eq r0.token_type 1u8 into r2;
    assert.eq r2 true;
    gt r0.quantity 0u128 into r3;
    assert.eq r3 true;
    cast r0.market_id self.caller r0.share_nonce into r4 as ShareClaimKey;
    hash.bhp256 r4 into r5 as field;
    cast r0.quantity into r6 as u64;
    call credits.aleo/transfer_public_to_private self.caller r6 into r7 r8;
    async redeem_shares r8 r5 r0.market_id r0.outcome r0.quantity 1u8 into r9;
    output r7 as credits.aleo/credits.record;
    output r9 as veiled_markets_v35.aleo/redeem_shares.future;

finalize redeem_shares:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u8.public;
    input r4 as u128.public;
    input r5 as u8.public;
    await r0;
    get markets[r2] into r6;
    is.eq r6.status 3u8 into r7;
    assert.eq r7 true;
    is.eq r6.token_type r5 into r8;
    assert.eq r8 true;
    get vote_tallies[r2] into r9;
    assert.eq r9.finalized true;
    is.eq r3 r9.winning_outcome into r10;
    assert.eq r10 true;
    get.or_use share_redeemed[r1] false into r11;
    not r11 into r12;
    assert.eq r12 true;
    set true into share_redeemed[r1];
    is.eq r5 1u8 into r13;
    ternary r13 0u8 1u8 into r14;
    get.or_use market_credits[r2] 0u128 into r15;
    gte r15 r4 into r16;
    assert.eq r16 true;
    sub r15 r4 into r17;
    set r17 into market_credits[r2];
    get.or_use program_credits[r14] 0u128 into r18;
    gte r18 r4 into r19;
    assert.eq r19 true;
    sub r18 r4 into r20;
    set r20 into program_credits[r14];

function claim_refund:
    input r0 as OutcomeShare.record;
    is.eq r0.owner self.caller into r1;
    assert.eq r1 true;
    is.eq r0.token_type 1u8 into r2;
    assert.eq r2 true;
    gt r0.quantity 0u128 into r3;
    assert.eq r3 true;
    cast r0.market_id self.caller r0.share_nonce into r4 as ShareClaimKey;
    hash.bhp256 r4 into r5 as field;
    cast self.caller r0.market_id r0.quantity r0.share_nonce 1u8 into r6 as RefundClaim.record;
    cast r0.quantity into r7 as u64;
    call credits.aleo/transfer_public_to_private self.caller r7 into r8 r9;
    async claim_refund r9 r5 r0.market_id r0.quantity 1u8 into r10;
    output r6 as RefundClaim.record;
    output r8 as credits.aleo/credits.record;
    output r10 as veiled_markets_v35.aleo/claim_refund.future;

finalize claim_refund:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u8.public;
    await r0;
    get markets[r2] into r5;
    is.eq r5.status 4u8 into r6;
    assert.eq r6 true;
    is.eq r5.token_type r4 into r7;
    assert.eq r7 true;
    get.or_use share_redeemed[r1] false into r8;
    not r8 into r9;
    assert.eq r9 true;
    set true into share_redeemed[r1];
    is.eq r4 1u8 into r10;
    ternary r10 0u8 1u8 into r11;
    get.or_use market_credits[r2] 0u128 into r12;
    gte r12 r3 into r13;
    assert.eq r13 true;
    sub r12 r3 into r14;
    set r14 into market_credits[r2];
    get.or_use program_credits[r11] 0u128 into r15;
    gte r15 r3 into r16;
    assert.eq r16 true;
    sub r15 r3 into r17;
    set r17 into program_credits[r11];

function claim_lp_refund:
    input r0 as LPToken.record;
    input r1 as u128.private;
    is.eq r0.owner self.caller into r2;
    assert.eq r2 true;
    is.eq r0.token_type 1u8 into r3;
    assert.eq r3 true;
    gt r0.lp_shares 0u128 into r4;
    assert.eq r4 true;
    gt r1 0u128 into r5;
    assert.eq r5 true;
    cast r0.market_id self.caller r0.lp_nonce into r6 as LPClaimKey;
    hash.bhp256 r6 into r7 as field;
    cast self.caller r0.market_id r1 r0.lp_nonce 1u8 into r8 as RefundClaim.record;
    cast r1 into r9 as u64;
    call credits.aleo/transfer_public self.caller r9 into r10;
    async claim_lp_refund r10 r7 r0.market_id r0.lp_shares r1 1u8 into r11;
    output r8 as RefundClaim.record;
    output r11 as veiled_markets_v35.aleo/claim_lp_refund.future;

finalize claim_lp_refund:
    input r0 as credits.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u8.public;
    await r0;
    get markets[r2] into r6;
    is.eq r6.status 4u8 into r7;
    assert.eq r7 true;
    is.eq r6.token_type r5 into r8;
    assert.eq r8 true;
    get.or_use lp_positions[r1] false into r9;
    not r9 into r10;
    assert.eq r10 true;
    set true into lp_positions[r1];
    get amm_pools[r2] into r11;
    add r11.reserve_1 r11.reserve_2 into r12;
    add r12 r11.reserve_3 into r13;
    add r13 r11.reserve_4 into r14;
    gt r14 0u128 into r15;
    assert.eq r15 true;
    mul r3 r14 into r16;
    div r16 r11.total_lp_shares into r17;
    gte r17 r4 into r18;
    assert.eq r18 true;
    gt r4 0u128 into r19;
    assert.eq r19 true;
    is.eq r5 1u8 into r20;
    ternary r20 0u8 1u8 into r21;
    get.or_use market_credits[r2] 0u128 into r22;
    gte r22 r4 into r23;
    assert.eq r23 true;
    sub r22 r4 into r24;
    set r24 into market_credits[r2];
    get.or_use program_credits[r21] 0u128 into r25;
    gte r25 r4 into r26;
    assert.eq r26 true;
    sub r25 r4 into r27;
    set r27 into program_credits[r21];
    sub r11.total_liquidity r4 into r28;
    sub r11.total_lp_shares r3 into r29;
    cast r2 r11.reserve_1 r11.reserve_2 r11.reserve_3 r11.reserve_4 r28 r29 r11.total_volume into r30 as AMMPool;
    set r30 into amm_pools[r2];

function withdraw_lp_resolved:
    input r0 as LPToken.record;
    input r1 as u128.private;
    is.eq r0.owner self.caller into r2;
    assert.eq r2 true;
    is.eq r0.token_type 1u8 into r3;
    assert.eq r3 true;
    gt r0.lp_shares 0u128 into r4;
    assert.eq r4 true;
    gt r1 0u128 into r5;
    assert.eq r5 true;
    cast r0.market_id self.caller r0.lp_nonce into r6 as LPClaimKey;
    hash.bhp256 r6 into r7 as field;
    cast r1 into r8 as u64;
    call credits.aleo/transfer_public_to_private self.caller r8 into r9 r10;
    async withdraw_lp_resolved r10 r7 r0.market_id r0.lp_shares r1 1u8 into r11;
    output r9 as credits.aleo/credits.record;
    output r11 as veiled_markets_v35.aleo/withdraw_lp_resolved.future;

finalize withdraw_lp_resolved:
    input r0 as credits.aleo/transfer_public_to_private.future;
    input r1 as field.public;
    input r2 as field.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u8.public;
    await r0;
    get markets[r2] into r6;
    is.eq r6.status 3u8 into r7;
    assert.eq r7 true;
    is.eq r6.token_type r5 into r8;
    assert.eq r8 true;
    get vote_tallies[r2] into r9;
    assert.eq r9.finalized true;
    cast block.height into r10 as u64;
    add r9.dispute_deadline 2880u64 into r11;
    gt r10 r11 into r12;
    assert.eq r12 true;
    get.or_use lp_positions[r1] false into r13;
    not r13 into r14;
    assert.eq r14 true;
    set true into lp_positions[r1];
    get amm_pools[r2] into r15;
    is.eq r5 1u8 into r16;
    ternary r16 0u8 1u8 into r17;
    get.or_use market_credits[r2] 0u128 into r18;
    mul r3 r18 into r19;
    div r19 r15.total_lp_shares into r20;
    gte r20 r4 into r21;
    assert.eq r21 true;
    gt r20 0u128 into r22;
    assert.eq r22 true;
    sub r18 r20 into r23;
    set r23 into market_credits[r2];
    get.or_use program_credits[r17] 0u128 into r24;
    gte r24 r20 into r25;
    assert.eq r25 true;
    sub r24 r20 into r26;
    set r26 into program_credits[r17];
    sub r15.total_lp_shares r3 into r27;
    cast r2 r15.reserve_1 r15.reserve_2 r15.reserve_3 r15.reserve_4 r15.total_liquidity r27 r15.total_volume into r28 as AMMPool;
    set r28 into amm_pools[r2];

function withdraw_creator_fees:
    input r0 as field.public;
    input r1 as u128.public;
    gt r1 0u128 into r2;
    assert.eq r2 true;
    cast r1 into r3 as u64;
    call credits.aleo/transfer_public self.caller r3 into r4;
    async withdraw_creator_fees r4 r0 self.caller r1 1u8 into r5;
    output r5 as veiled_markets_v35.aleo/withdraw_creator_fees.future;

finalize withdraw_creator_fees:
    input r0 as credits.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as address.public;
    input r3 as u128.public;
    input r4 as u8.public;
    await r0;
    get markets[r1] into r5;
    is.eq r5.status 3u8 into r6;
    assert.eq r6 true;
    is.eq r5.creator r2 into r7;
    assert.eq r7 true;
    is.eq r5.token_type r4 into r8;
    assert.eq r8 true;
    get vote_tallies[r1] into r9;
    assert.eq r9.finalized true;
    cast block.height into r10 as u64;
    add r9.dispute_deadline 2880u64 into r11;
    gt r10 r11 into r12;
    assert.eq r12 true;
    get.or_use creator_fees_claimed[r1] false into r13;
    not r13 into r14;
    assert.eq r14 true;
    set true into creator_fees_claimed[r1];
    get market_fees[r1] into r15;
    gte r15.creator_fees r3 into r16;
    assert.eq r16 true;
    is.eq r4 1u8 into r17;
    ternary r17 0u8 1u8 into r18;
    get.or_use market_credits[r1] 0u128 into r19;
    gte r19 r3 into r20;
    assert.eq r20 true;
    sub r19 r3 into r21;
    set r21 into market_credits[r1];
    get.or_use program_credits[r18] 0u128 into r22;
    gte r22 r3 into r23;
    assert.eq r23 true;
    sub r22 r3 into r24;
    set r24 into program_credits[r18];

function init_multisig:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u8.public;
    gte r3 2u8 into r4;
    lte r3 3u8 into r5;
    and r4 r5 into r6;
    assert.eq r6 true;
    async init_multisig r0 r1 r2 r3 self.caller into r7;
    output r7 as veiled_markets_v35.aleo/init_multisig.future;

finalize init_multisig:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as address.public;
    input r3 as u8.public;
    input r4 as address.public;
    contains multisig_config[0u8] into r5;
    not r5 into r6;
    assert.eq r6 true;
    is.eq r4 aleo10tm5ektsr5v7kdc5phs8pha42vrkhe2rlxfl2v979wunhzx07vpqnqplv8 into r7;
    assert.eq r7 true;
    is.neq r0 r1 into r8;
    assert.eq r8 true;
    is.neq r0 r2 into r9;
    assert.eq r9 true;
    is.neq r1 r2 into r10;
    assert.eq r10 true;
    cast r0 r1 r2 r3 into r11 as SignerConfig;
    set r11 into multisig_config[0u8];

function propose_treasury_withdrawal:
    input r0 as u128.public;
    input r1 as address.public;
    input r2 as u8.public;
    input r3 as u64.public;
    gt r0 0u128 into r4;
    assert.eq r4 true;
    is.eq r2 1u8 into r5;
    assert.eq r5 true;
    cast self.caller 1u8 r0 r1 r2 r3 into r6 as ProposalSeed;
    hash.bhp256 r6 into r7 as field;
    async propose_treasury_withdrawal r7 r0 r1 self.caller r2 into r8;
    output r7 as field.private;
    output r8 as veiled_markets_v35.aleo/propose_treasury_withdrawal.future;

finalize propose_treasury_withdrawal:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    input r3 as address.public;
    input r4 as u8.public;
    get multisig_config[0u8] into r5;
    is.eq r3 r5.signer_1 into r6;
    is.eq r3 r5.signer_2 into r7;
    or r6 r7 into r8;
    is.eq r3 r5.signer_3 into r9;
    or r8 r9 into r10;
    assert.eq r10 true;
    contains multisig_proposals[r0] into r11;
    not r11 into r12;
    assert.eq r12 true;
    is.eq r4 1u8 into r13;
    ternary r13 0u8 1u8 into r14;
    get.or_use protocol_treasury[r14] 0u128 into r15;
    gte r15 r1 into r16;
    assert.eq r16 true;
    cast block.height into r17 as u64;
    cast r0 1u8 r1 r2 r4 r17 into r18 as MultiSigProposal;
    set r18 into multisig_proposals[r0];
    cast r0 r3 into r19 as ApprovalKey;
    hash.bhp256 r19 into r20 as field;
    set true into multisig_approvals[r20];

function approve_proposal:
    input r0 as field.public;
    async approve_proposal r0 self.caller into r1;
    output r1 as veiled_markets_v35.aleo/approve_proposal.future;

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

function execute_proposal:
    input r0 as field.public;
    input r1 as u128.public;
    input r2 as address.public;
    cast r1 into r3 as u64;
    call credits.aleo/transfer_public r2 r3 into r4;
    async execute_proposal r4 r0 r1 r2 0u8 into r5;
    output r5 as veiled_markets_v35.aleo/execute_proposal.future;

finalize execute_proposal:
    input r0 as credits.aleo/transfer_public.future;
    input r1 as field.public;
    input r2 as u128.public;
    input r3 as address.public;
    input r4 as u8.public;
    await r0;
    get multisig_config[0u8] into r5;
    get multisig_proposals[r1] into r6;
    is.eq r6.amount r2 into r7;
    assert.eq r7 true;
    is.eq r6.recipient r3 into r8;
    assert.eq r8 true;
    is.eq r6.token_type 1u8 into r9;
    assert.eq r9 true;
    cast r1 r5.signer_1 into r10 as ApprovalKey;
    hash.bhp256 r10 into r11 as field;
    cast r1 r5.signer_2 into r12 as ApprovalKey;
    hash.bhp256 r12 into r13 as field;
    cast r1 r5.signer_3 into r14 as ApprovalKey;
    hash.bhp256 r14 into r15 as field;
    get.or_use multisig_approvals[r11] false into r16;
    get.or_use multisig_approvals[r13] false into r17;
    get.or_use multisig_approvals[r15] false into r18;
    ternary r16 1u8 0u8 into r19;
    add r19 1u8 into r20;
    ternary r17 r20 r19 into r21;
    add r21 1u8 into r22;
    ternary r18 r22 r21 into r23;
    gte r23 r5.threshold into r24;
    assert.eq r24 true;
    get protocol_treasury[r4] into r25;
    gte r25 r2 into r26;
    assert.eq r26 true;
    sub r25 r2 into r27;
    set r27 into protocol_treasury[r4];
    get.or_use program_credits[r4] 0u128 into r28;
    gte r28 r2 into r29;
    assert.eq r29 true;
    sub r28 r2 into r30;
    set r30 into program_credits[r4];
    remove multisig_proposals[r1];
    remove multisig_approvals[r11];
    remove multisig_approvals[r13];
    remove multisig_approvals[r15];

function claim_voter_reward:
    input r0 as u64.public;
    gt r0 0u64 into r1;
    assert.eq r1 true;
    call credits.aleo/transfer_public_to_private self.caller r0 into r2 r3;
    cast r0 into r4 as u128;
    async claim_voter_reward r3 self.caller r4 into r5;
    output r2 as credits.aleo/credits.record;
    output r5 as veiled_markets_v35.aleo/claim_voter_reward.future;

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
