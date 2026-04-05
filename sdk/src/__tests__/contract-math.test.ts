import { describe, expect, it } from 'vitest';
import {
  calculateContractAllPrices,
  calculateContractLPSharesOut,
  calculateContractLPTokensOut,
  calculateContractMaxTokensDesired,
  calculateContractMinDisputeBond,
  calculateContractOutcomePrice,
  calculateContractResolutionReward,
  calculateContractSellTokensOut,
  calculateContractTradeFees,
  calculateContractWinnerClaimUnlock,
  quoteContractAddLiquidity,
  quoteContractBuy,
  quoteContractSell,
  type ContractMathReserves,
} from '../contract-math';

describe('contract math parity', () => {
  it('matches binary buy math from the Leo contract', () => {
    const reserves: ContractMathReserves = {
      reserve1: 10_000n,
      reserve2: 10_000n,
      numOutcomes: 2,
    };

    const quote = quoteContractBuy(reserves, 1, 2_000n);

    expect(quote.protocolFee).toBe(10n);
    expect(quote.creatorFee).toBe(10n);
    expect(quote.amountToPool).toBe(1_980n);
    expect(quote.sharesOut).toBe(3_633n);
    expect(quote.updatedReserves).toEqual([8_347n, 11_980n, 0n, 0n]);
  });

  it('matches binary and multi-outcome display prices', () => {
    expect(
      calculateContractOutcomePrice(
        {
          reserve1: 7_500n,
          reserve2: 2_500n,
          numOutcomes: 2,
        },
        1,
      ),
    ).toBeCloseTo(0.25, 6);

    const prices = calculateContractAllPrices({
      reserve1: 3_000n,
      reserve2: 3_000n,
      reserve3: 4_000n,
      numOutcomes: 3,
    });
    expect(prices[0]).toBeCloseTo(0.363636, 5);
    expect(prices[1]).toBeCloseTo(0.363636, 5);
    expect(prices[2]).toBeCloseTo(0.272727, 5);
  });

  it('matches four-outcome buy step division', () => {
    const reserves: ContractMathReserves = {
      reserve1: 10_000n,
      reserve2: 10_000n,
      reserve3: 10_000n,
      reserve4: 10_000n,
      numOutcomes: 4,
    };

    const quote = quoteContractBuy(reserves, 3, 4_000n);

    expect(quote.protocolFee).toBe(20n);
    expect(quote.creatorFee).toBe(20n);
    expect(quote.amountToPool).toBe(3_960n);
    expect(quote.sharesOut).toBe(10_285n);
    expect(quote.updatedReserves).toEqual([13_960n, 13_960n, 3_675n, 13_960n]);
  });

  it('matches binary sell math and fee split', () => {
    const reserves: ContractMathReserves = {
      reserve1: 8_347n,
      reserve2: 11_980n,
      numOutcomes: 2,
    };

    const quote = quoteContractSell(reserves, 1, 1_000n);

    expect(quote.protocolFee).toBe(5n);
    expect(quote.creatorFee).toBe(5n);
    expect(quote.lpFee).toBe(10n);
    expect(quote.poolTokensOut).toBe(990n);
    expect(quote.netTokens).toBe(980n);
    expect(quote.sharesNeeded).toBe(1_741n);
    expect(quote.updatedReserves).toEqual([9_098n, 10_990n, 0n, 0n]);
  });

  it('matches sell-from-shares parity helpers', () => {
    const reserves: ContractMathReserves = {
      reserve1: 8_347n,
      reserve2: 11_980n,
      numOutcomes: 2,
    };

    expect(calculateContractMaxTokensDesired(reserves, 1, 1_741n)).toBe(1_000n);
    expect(calculateContractSellTokensOut(reserves, 1, 1_741n)).toBe(980n);
  });

  it('matches uneven-pool LP minting', () => {
    const reserves: ContractMathReserves = {
      reserve1: 8_347n,
      reserve2: 11_980n,
      numOutcomes: 2,
    };

    const quote = quoteContractAddLiquidity(reserves, 20_000n, 5_000n);

    expect(quote.mintedLPShares).toBe(4_919n);
    expect(quote.reserveAdditions).toEqual([2_053n, 2_946n, 0n, 1n]);
    expect(quote.updatedReserves).toEqual([10_400n, 14_926n, 0n, 1n]);
  });

  it('matches simple LP wrappers', () => {
    expect(calculateContractLPSharesOut(5_000n, 20_000n, 20_327n)).toBe(4_919n);
    expect(calculateContractLPTokensOut(5_000n, 10_000n, 20_000n)).toBe(10_000n);
  });

  it('matches three-outcome buy then sell path', () => {
    const initialReserves: ContractMathReserves = {
      reserve1: 10_000n,
      reserve2: 10_000n,
      reserve3: 10_000n,
      numOutcomes: 3,
    };

    const buyQuote = quoteContractBuy(initialReserves, 2, 6_000n);
    const sellQuote = quoteContractSell(
      {
        reserve1: buyQuote.updatedReserves[0],
        reserve2: buyQuote.updatedReserves[1],
        reserve3: buyQuote.updatedReserves[2],
        numOutcomes: 3,
      },
      2,
      2_000n,
    );

    expect(buyQuote.amountToPool).toBe(5_940n);
    expect(buyQuote.sharesOut).toBe(12_005n);
    expect(buyQuote.updatedReserves).toEqual([15_940n, 3_935n, 15_940n, 0n]);
    expect(sellQuote.netTokens).toBe(1_960n);
    expect(sellQuote.poolTokensOut).toBe(1_980n);
    expect(sellQuote.sharesNeeded).toBe(3_175n);
    expect(sellQuote.updatedReserves).toEqual([13_960n, 5_130n, 13_960n, 0n]);
  });

  it('matches resolution helper math', () => {
    expect(calculateContractResolutionReward(5_000n)).toBe(1_000n);
    expect(calculateContractMinDisputeBond(3_000_000n)).toBe(9_000_000n);
    expect(calculateContractWinnerClaimUnlock(5_861n)).toBe(8_741n);
  });

  it('keeps a round-trip buy then sell loss bounded to fees', () => {
    const initialReserves: ContractMathReserves = {
      reserve1: 10_000n,
      reserve2: 10_000n,
      numOutcomes: 2,
    };

    const buyQuote = quoteContractBuy(initialReserves, 1, 2_000n);
    const postBuyReserves: ContractMathReserves = {
      reserve1: buyQuote.updatedReserves[0],
      reserve2: buyQuote.updatedReserves[1],
      numOutcomes: 2,
    };
    const maxTokensDesired = calculateContractMaxTokensDesired(postBuyReserves, 1, buyQuote.sharesOut);
    const roundTripNet = calculateContractSellTokensOut(postBuyReserves, 1, buyQuote.sharesOut);

    expect(maxTokensDesired).toBe(2_000n);
    expect(roundTripNet).toBe(1_960n);
    expect(roundTripNet).toBeLessThan(2_000n);
  });

  it('moves three-outcome prices in the expected direction through buy then sell flow', () => {
    const initialReserves: ContractMathReserves = {
      reserve1: 10_000n,
      reserve2: 10_000n,
      reserve3: 10_000n,
      numOutcomes: 3,
    };

    const initialPrices = calculateContractAllPrices(initialReserves);
    const buyQuote = quoteContractBuy(initialReserves, 2, 6_000n);
    const postBuyReserves: ContractMathReserves = {
      reserve1: buyQuote.updatedReserves[0],
      reserve2: buyQuote.updatedReserves[1],
      reserve3: buyQuote.updatedReserves[2],
      numOutcomes: 3,
    };
    const postBuyPrices = calculateContractAllPrices(postBuyReserves);
    const sellQuote = quoteContractSell(postBuyReserves, 2, 2_000n);
    const postSellReserves: ContractMathReserves = {
      reserve1: sellQuote.updatedReserves[0],
      reserve2: sellQuote.updatedReserves[1],
      reserve3: sellQuote.updatedReserves[2],
      numOutcomes: 3,
    };
    const postSellPrices = calculateContractAllPrices(postSellReserves);

    expect(initialPrices[1]).toBeCloseTo(0.333333, 5);
    expect(postBuyPrices[1]).toBeCloseTo(0.669466, 5);
    expect(postSellPrices[1]).toBeCloseTo(0.576383, 5);
    expect(postBuyPrices[1]).toBeGreaterThan(initialPrices[1]);
    expect(postSellPrices[1]).toBeLessThan(postBuyPrices[1]);
    expect(postSellPrices[1]).toBeGreaterThan(initialPrices[1]);
    expect(postSellPrices.reduce((sum, price) => sum + price, 0)).toBeCloseTo(1, 5);
  });

  it('applies governance fee overrides to buy and sell quotes', () => {
    const reserves: ContractMathReserves = {
      reserve1: 10_000n,
      reserve2: 10_000n,
      numOutcomes: 2,
    };
    const customFees = {
      protocolFeeBps: 100n,
      creatorFeeBps: 100n,
      lpFeeBps: 200n,
    };

    const feeBreakdown = calculateContractTradeFees(2_000n, customFees);
    const buyQuote = quoteContractBuy(reserves, 1, 2_000n, customFees);
    const sellQuote = quoteContractSell(
      {
        reserve1: 8_347n,
        reserve2: 11_980n,
        numOutcomes: 2,
      },
      1,
      1_000n,
      customFees,
    );

    expect(feeBreakdown).toMatchObject({
      protocolFee: 20n,
      creatorFee: 20n,
      lpFee: 40n,
      totalFees: 80n,
      amountAfterFees: 1_920n,
      amountToPool: 1_960n,
    });
    expect(buyQuote.sharesOut).toBe(3_599n);
    expect(sellQuote.poolTokensOut).toBe(980n);
    expect(sellQuote.netTokens).toBe(960n);
    expect(sellQuote.sharesNeeded).toBe(1_723n);
  });

  it('keeps four-outcome liquidity additions proportional and fully allocated', () => {
    const reserves: ContractMathReserves = {
      reserve1: 12_000n,
      reserve2: 8_000n,
      reserve3: 5_000n,
      reserve4: 7_000n,
      numOutcomes: 4,
    };

    const quote = quoteContractAddLiquidity(reserves, 64_000n, 16_000n);

    expect(quote.mintedLPShares).toBe(32_000n);
    expect(quote.reserveAdditions).toEqual([6_000n, 4_000n, 2_500n, 3_500n]);
    expect(quote.updatedReserves).toEqual([18_000n, 12_000n, 7_500n, 10_500n]);
    expect(quote.reserveAdditions.reduce((sum, value) => sum + value, 0n)).toBe(16_000n);
  });
});
