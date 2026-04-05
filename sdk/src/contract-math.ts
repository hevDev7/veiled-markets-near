import {
  CREATOR_FEE_BPS,
  FEE_DENOMINATOR,
  LP_FEE_BPS,
  PROTOCOL_FEE_BPS,
} from './types';

export interface ContractMathReserves {
  reserve1: bigint;
  reserve2: bigint;
  reserve3?: bigint;
  reserve4?: bigint;
  numOutcomes: number;
}

export interface ContractFeeConfig {
  protocolFeeBps: bigint;
  creatorFeeBps: bigint;
  lpFeeBps: bigint;
}

export interface ContractBuyQuote {
  protocolFee: bigint;
  creatorFee: bigint;
  amountToPool: bigint;
  sharesOut: bigint;
  updatedReserves: [bigint, bigint, bigint, bigint];
}

export interface ContractSellQuote {
  protocolFee: bigint;
  creatorFee: bigint;
  lpFee: bigint;
  poolTokensOut: bigint;
  netTokens: bigint;
  sharesNeeded: bigint;
  updatedReserves: [bigint, bigint, bigint, bigint];
}

export interface ContractLiquidityQuote {
  mintedLPShares: bigint;
  reserveAdditions: [bigint, bigint, bigint, bigint];
  updatedReserves: [bigint, bigint, bigint, bigint];
}

export interface ContractTradeFees {
  protocolFee: bigint;
  creatorFee: bigint;
  lpFee: bigint;
  totalFees: bigint;
  amountAfterFees: bigint;
  amountToPool: bigint;
}

const DISPLAY_PRICE_SCALE = 1_000_000n;

const DEFAULT_CONTRACT_FEE_CONFIG: ContractFeeConfig = {
  protocolFeeBps: PROTOCOL_FEE_BPS,
  creatorFeeBps: CREATOR_FEE_BPS,
  lpFeeBps: LP_FEE_BPS,
};

function resolveFeeConfig(feeConfig?: Partial<ContractFeeConfig>): ContractFeeConfig {
  return {
    protocolFeeBps: feeConfig?.protocolFeeBps ?? DEFAULT_CONTRACT_FEE_CONFIG.protocolFeeBps,
    creatorFeeBps: feeConfig?.creatorFeeBps ?? DEFAULT_CONTRACT_FEE_CONFIG.creatorFeeBps,
    lpFeeBps: feeConfig?.lpFeeBps ?? DEFAULT_CONTRACT_FEE_CONFIG.lpFeeBps,
  };
}

function getActiveReserves(reserves: ContractMathReserves): [bigint, bigint, bigint, bigint] {
  return [
    reserves.reserve1,
    reserves.reserve2,
    reserves.numOutcomes >= 3 ? (reserves.reserve3 ?? 0n) : 0n,
    reserves.numOutcomes >= 4 ? (reserves.reserve4 ?? 0n) : 0n,
  ];
}

function getOutcomeReserve(reserves: [bigint, bigint, bigint, bigint], outcome: number): bigint {
  return reserves[outcome - 1] ?? 0n;
}

function getContractPriceNumerators(
  reserves: [bigint, bigint, bigint, bigint],
  numOutcomes: number,
): bigint[] {
  if (numOutcomes === 2) {
    return [reserves[1], reserves[0]];
  }

  const numerators: bigint[] = [];
  for (let outcomeIndex = 0; outcomeIndex < numOutcomes; outcomeIndex += 1) {
    let numerator = 1n;
    for (let reserveIndex = 0; reserveIndex < numOutcomes; reserveIndex += 1) {
      if (reserveIndex !== outcomeIndex) {
        numerator *= reserves[reserveIndex];
      }
    }
    numerators.push(numerator);
  }

  return numerators;
}

export function calculateContractOutcomePrice(
  reserves: ContractMathReserves,
  outcome: number,
): number {
  if (reserves.numOutcomes <= 0) {
    return 0;
  }

  const activeReserves = getActiveReserves(reserves);
  const numerators = getContractPriceNumerators(activeReserves, reserves.numOutcomes);
  const denominator = numerators.reduce((acc, value) => acc + value, 0n);

  if (denominator === 0n) {
    return 1 / reserves.numOutcomes;
  }

  const numerator = numerators[outcome - 1] ?? 0n;
  return Number((numerator * DISPLAY_PRICE_SCALE) / denominator) / Number(DISPLAY_PRICE_SCALE);
}

export function calculateContractAllPrices(reserves: ContractMathReserves): number[] {
  const prices: number[] = [];

  for (let outcome = 1; outcome <= reserves.numOutcomes; outcome += 1) {
    prices.push(calculateContractOutcomePrice(reserves, outcome));
  }

  return prices;
}

export function calculateContractTradeFees(
  amountIn: bigint,
  feeConfig?: Partial<ContractFeeConfig>,
): ContractTradeFees {
  const resolvedFees = resolveFeeConfig(feeConfig);
  const protocolFee = (amountIn * resolvedFees.protocolFeeBps) / FEE_DENOMINATOR;
  const creatorFee = (amountIn * resolvedFees.creatorFeeBps) / FEE_DENOMINATOR;
  const lpFee = (amountIn * resolvedFees.lpFeeBps) / FEE_DENOMINATOR;
  const totalFees = protocolFee + creatorFee + lpFee;
  const amountAfterFees = amountIn - totalFees;
  const amountToPool = amountIn - protocolFee - creatorFee;

  return {
    protocolFee,
    creatorFee,
    lpFee,
    totalFees,
    amountAfterFees,
    amountToPool,
  };
}

export function quoteContractBuy(
  reserves: ContractMathReserves,
  outcome: number,
  amountIn: bigint,
  feeConfig?: Partial<ContractFeeConfig>,
): ContractBuyQuote {
  const { protocolFee, creatorFee, amountToPool } = calculateContractTradeFees(amountIn, feeConfig);
  const activeReserves = getActiveReserves(reserves);
  const rI = getOutcomeReserve(activeReserves, outcome);

  let step = rI;
  for (let index = 0; index < reserves.numOutcomes; index += 1) {
    const reserveOutcome = index + 1;
    if (reserveOutcome !== outcome) {
      const rk = activeReserves[index];
      step = (step * rk) / (rk + amountToPool);
    }
  }

  const sharesOut = (rI + amountToPool) - step;
  const updatedReserves: [bigint, bigint, bigint, bigint] = [...activeReserves] as [bigint, bigint, bigint, bigint];
  for (let index = 0; index < reserves.numOutcomes; index += 1) {
    updatedReserves[index] = index + 1 === outcome ? step : activeReserves[index] + amountToPool;
  }

  return {
    protocolFee,
    creatorFee,
    amountToPool,
    sharesOut,
    updatedReserves,
  };
}

export function quoteContractSell(
  reserves: ContractMathReserves,
  outcome: number,
  tokensDesired: bigint,
  feeConfig?: Partial<ContractFeeConfig>,
): ContractSellQuote {
  const { protocolFee, creatorFee, lpFee, amountAfterFees } = calculateContractTradeFees(tokensDesired, feeConfig);
  const poolTokensOut = tokensDesired - lpFee;
  const netTokens = amountAfterFees;
  const activeReserves = getActiveReserves(reserves);
  const rI = getOutcomeReserve(activeReserves, outcome);

  let step = rI;
  for (let index = 0; index < reserves.numOutcomes; index += 1) {
    const reserveOutcome = index + 1;
    if (reserveOutcome !== outcome) {
      const rk = activeReserves[index];
      if (rk <= poolTokensOut) {
        throw new Error('Pool cannot satisfy sell quote');
      }
      step = (step * rk) / (rk - poolTokensOut);
    }
  }

  const sharesNeeded = step - rI + poolTokensOut;
  const updatedReserves: [bigint, bigint, bigint, bigint] = [...activeReserves] as [bigint, bigint, bigint, bigint];
  for (let index = 0; index < reserves.numOutcomes; index += 1) {
    updatedReserves[index] = index + 1 === outcome ? step : activeReserves[index] - poolTokensOut;
  }

  return {
    protocolFee,
    creatorFee,
    lpFee,
    poolTokensOut,
    netTokens,
    sharesNeeded,
    updatedReserves,
  };
}

export function calculateContractMaxTokensDesired(
  reserves: ContractMathReserves,
  outcome: number,
  availableShares: bigint,
  feeConfig?: Partial<ContractFeeConfig>,
): bigint {
  if (availableShares <= 0n) {
    return 0n;
  }

  const activeReserves = getActiveReserves(reserves);
  let maxPoolTokensOut = 0n;

  for (let index = 0; index < reserves.numOutcomes; index += 1) {
    if (index + 1 === outcome) {
      continue;
    }

    const limit = activeReserves[index] - 1n;
    if (limit <= 0n) {
      return 0n;
    }

    if (maxPoolTokensOut === 0n || limit < maxPoolTokensOut) {
      maxPoolTokensOut = limit;
    }
  }

  if (maxPoolTokensOut <= 0n) {
    return 0n;
  }

  const resolvedFees = resolveFeeConfig(feeConfig);
  let low = 0n;
  let high = (maxPoolTokensOut * FEE_DENOMINATOR) / (FEE_DENOMINATOR - resolvedFees.lpFeeBps);
  let best = 0n;

  for (let iteration = 0; iteration < 60 && low <= high; iteration += 1) {
    const mid = (low + high) / 2n;
    if (mid === 0n) {
      low = 1n;
      continue;
    }

    try {
      const quote = quoteContractSell(reserves, outcome, mid, resolvedFees);
      if (quote.sharesNeeded <= availableShares) {
        best = mid;
        low = mid + 1n;
      } else {
        high = mid - 1n;
      }
    } catch {
      high = mid - 1n;
    }
  }

  return best;
}

export function calculateContractSellTokensOut(
  reserves: ContractMathReserves,
  outcome: number,
  sharesToSell: bigint,
  feeConfig?: Partial<ContractFeeConfig>,
): bigint {
  const maxTokensDesired = calculateContractMaxTokensDesired(reserves, outcome, sharesToSell, feeConfig);
  if (maxTokensDesired <= 0n) {
    return 0n;
  }

  return calculateContractTradeFees(maxTokensDesired, feeConfig).amountAfterFees;
}

export function calculateContractLPSharesOut(
  amount: bigint,
  totalLPShares: bigint,
  totalReserves: bigint,
): bigint {
  if (totalReserves === 0n) {
    return amount;
  }

  return (amount * totalLPShares) / totalReserves;
}

export function calculateContractLPTokensOut(
  sharesToRemove: bigint,
  totalLPShares: bigint,
  totalReserves: bigint,
): bigint {
  if (totalLPShares === 0n) {
    return 0n;
  }

  return (sharesToRemove * totalReserves) / totalLPShares;
}

export function quoteContractAddLiquidity(
  reserves: ContractMathReserves,
  totalLPShares: bigint,
  amount: bigint,
): ContractLiquidityQuote {
  const activeReserves = getActiveReserves(reserves);
  const totalReserves = activeReserves
    .slice(0, reserves.numOutcomes)
    .reduce((acc, reserve) => acc + reserve, 0n);

  const mintedLPShares = (amount * totalLPShares) / totalReserves;
  const add1 = (amount * activeReserves[0]) / totalReserves;
  const add2 = (amount * activeReserves[1]) / totalReserves;
  const add3 = reserves.numOutcomes >= 3 ? (amount * activeReserves[2]) / totalReserves : 0n;
  const add4 = amount - add1 - add2 - add3;

  const reserveAdditions: [bigint, bigint, bigint, bigint] = [add1, add2, add3, add4];
  const updatedReserves: [bigint, bigint, bigint, bigint] = [
    activeReserves[0] + add1,
    activeReserves[1] + add2,
    activeReserves[2] + add3,
    activeReserves[3] + add4,
  ];

  return {
    mintedLPShares,
    reserveAdditions,
    updatedReserves,
  };
}

export function calculateContractResolutionReward(protocolFees: bigint): bigint {
  return (protocolFees * 20n) / 100n;
}

export function calculateContractMinDisputeBond(totalBonded: bigint): bigint {
  return totalBonded * 3n;
}

export function calculateContractWinnerClaimUnlock(disputeDeadline: bigint): bigint {
  return disputeDeadline + 2880n;
}
