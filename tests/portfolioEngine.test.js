// Mock storage dependencies to isolate state transitions in unit/integration testing
jest.mock('../src/services/storageService', () => ({
  storageService: {
    getStoredPortfolios: jest.fn().mockResolvedValue([]),
    setStoredPortfolios: jest.fn().mockResolvedValue(true),
    getStoredActivePortfolioId: jest.fn().mockResolvedValue('portfolio-1'),
    setStoredActivePortfolioId: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('../src/services/persistentLruCache', () => ({
  persistentLruCache: {
    getJson: jest.fn().mockResolvedValue(null),
    setJson: jest.fn().mockResolvedValue(true),
  },
  getByteSize: jest.fn().mockReturnValue(100),
}));

import { executeOrder, executePortfolioOrder } from '../src/context/PortfolioContext';

describe('Portfolio Order Execution Engine (PortfolioContext.executeOrder)', () => {
  let basePortfolio;

  beforeEach(() => {
    basePortfolio = {
      id: 'portfolio-test-1',
      title: 'Portfolio test',
      startingCash: 10000.0,
      cash: 10000.0,
      positions: [],
      createdAt: 1700000000000,
    };
  });

  describe('Argument and State Validation', () => {
    test('throws when target portfolio is undefined or null', () => {
      expect(() => {
        executeOrder(null, { symbol: 'AAPL', mode: 'BUY', shares: 5, price: 150 });
      }).toThrow('Target portfolio not found');
    });

    test('throws when symbol is missing or empty', () => {
      expect(() => {
        executeOrder(basePortfolio, { symbol: '', mode: 'BUY', shares: 5, price: 150 });
      }).toThrow('Invalid order arguments');
    });

    test('throws when shares count is zero or negative', () => {
      expect(() => {
        executeOrder(basePortfolio, { symbol: 'AAPL', mode: 'BUY', shares: 0, price: 150 });
      }).toThrow('Invalid order arguments');

      expect(() => {
        executeOrder(basePortfolio, { symbol: 'AAPL', mode: 'BUY', shares: -10, price: 150 });
      }).toThrow('Invalid order arguments');
    });

    test('throws when share price is zero or negative', () => {
      expect(() => {
        executeOrder(basePortfolio, { symbol: 'AAPL', mode: 'BUY', shares: 5, price: 0 });
      }).toThrow('Invalid order arguments');

      expect(() => {
        executeOrder(basePortfolio, { symbol: 'AAPL', mode: 'BUY', shares: 5, price: -50 });
      }).toThrow('Invalid order arguments');
    });
  });

  describe('BUY Order Processing & Weighted Cost Averaging', () => {
    test('opens a fresh position and deducts cash accurately', () => {
      const summary = executeOrder(basePortfolio, {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        mode: 'BUY',
        shares: 10,
        price: 120.5,
      });

      expect(summary.success).toBe(true);
      expect(summary.mode).toBe('BUY');
      expect(summary.symbol).toBe('NVDA');
      expect(summary.shares).toBe(10);
      expect(summary.fillPrice).toBe(120.5);
      expect(summary.orderCost).toBe(1205.0);
      expect(summary.newCash).toBe(8795.0);

      expect(summary.newPositions.length).toBe(1);
      const pos = summary.newPositions[0];
      expect(pos.symbol).toBe('NVDA');
      expect(pos.shares).toBe(10);
      expect(pos.avgCost).toBe(120.5);
      expect(pos.totalCost).toBe(1205.0);
    });

    test('blends weighted average cost when adding to existing position', () => {
      // First buy: 10 shares @ $100 = $1,000 cost
      const step1 = executeOrder(basePortfolio, {
        symbol: 'AAPL',
        mode: 'BUY',
        shares: 10,
        price: 100,
      });

      const updatedPortfolio = {
        ...basePortfolio,
        cash: step1.newCash,
        positions: step1.newPositions,
      };

      // Second buy: 10 shares @ $150 = $1,500 cost... blended avg = $125
      const step2 = executeOrder(updatedPortfolio, {
        symbol: 'AAPL',
        mode: 'BUY',
        shares: 10,
        price: 150,
      });

      expect(step2.newCash).toBe(7500.0);
      expect(step2.newPositions.length).toBe(1);

      const pos = step2.newPositions[0];
      expect(pos.shares).toBe(20);
      expect(pos.avgCost).toBe(125.0);
      expect(pos.totalCost).toBe(2500.0);
    });

    test('handles fractional shares and uneven prices in cost basis calculations', () => {
      // First buy: 2.5 shares @ $130.40 = $326.00
      const step1 = executeOrder(basePortfolio, {
        symbol: 'TSLA',
        mode: 'BUY',
        shares: 2.5,
        price: 130.4,
      });

      const updatedPortfolio = {
        ...basePortfolio,
        cash: step1.newCash,
        positions: step1.newPositions,
      };

      // 1.5 shares @ $150.80 = $226.20
      // Total shares: 4.0, Total cost: $552.20, Avg cost: $138.05
      const step2 = executeOrder(updatedPortfolio, {
        symbol: 'TSLA',
        mode: 'BUY',
        shares: 1.5,
        price: 150.8,
      });

      const pos = step2.newPositions[0];
      expect(pos.shares).toBe(4);
      expect(pos.avgCost).toBe(138.05);
      expect(pos.totalCost).toBe(552.2);
      expect(step2.newCash).toBeCloseTo(10000 - 552.2, 2);
    });

    test('throws Insufficient funds error when order exceeds available cash', () => {
      expect(() => {
        executeOrder(basePortfolio, {
          symbol: 'AMZN',
          mode: 'BUY',
          shares: 100,
          price: 200,
        });
      }).toThrow(/Insufficient funds/);
    });
  });

  describe('SELL Order Processing & Position Liquidation', () => {
    let portfolioWithHoldings;

    beforeEach(() => {
      portfolioWithHoldings = {
        id: 'portfolio-test-1',
        title: 'Portfolio test',
        startingCash: 10000.0,
        cash: 5000.0,
        positions: [
          {
            id: 'pos-NVDA-1',
            symbol: 'NVDA',
            name: 'NVIDIA Corporation',
            shares: 10.0,
            avgCost: 100.0,
            totalCost: 1000.0,
          },
          {
            id: 'pos-MSFT-1',
            symbol: 'MSFT',
            name: 'Microsoft Corp',
            shares: 5.0,
            avgCost: 400.0,
            totalCost: 2000.0,
          },
        ],
      };
    });

    test('executes partial sell, maintaining avgCost and updating totalCost', () => {
      // Sell 4 shares of NVDA at market price $110 = $440 proceeds
      const summary = executeOrder(portfolioWithHoldings, {
        symbol: 'NVDA',
        mode: 'SELL',
        shares: 4,
        price: 110,
      });

      expect(summary.success).toBe(true);
      expect(summary.newCash).toBe(5440.0);
      expect(summary.newPositions.length).toBe(2);

      const nvdaPos = summary.newPositions.find((p) => p.symbol === 'NVDA');
      expect(nvdaPos.shares).toBe(6.0);
      expect(nvdaPos.avgCost).toBe(100.0);
      expect(nvdaPos.totalCost).toBe(600.0);
    });

    test('fully closes and removes position when all shares are liquidated', () => {
      // Sell all 10 shares of NVDA at $95
      const summary = executeOrder(portfolioWithHoldings, {
        symbol: 'NVDA',
        mode: 'SELL',
        shares: 10,
        price: 95,
      });

      expect(summary.newCash).toBe(5950.0);
      expect(summary.newPositions.length).toBe(1);
      expect(summary.newPositions.find((p) => p.symbol === 'NVDA')).toBeUndefined();
      expect(summary.newPositions[0].symbol).toBe('MSFT');

      expect(summary.newPosition.shares).toBe(0);
      expect(summary.newPosition.avgCost).toBe(0);
      expect(summary.newPosition.totalCost).toBe(0);
    });

    test('throws Insufficient shares error when attempting to sell more than owned', () => {
      expect(() => {
        executeOrder(portfolioWithHoldings, {
          symbol: 'NVDA',
          mode: 'SELL',
          shares: 10.01,
          price: 100,
        });
      }).toThrow(/Insufficient shares: Owned 10, Attempted to sell 10.01/);
    });

    test('throws Insufficient shares error when selling a symbol not owned in portfolio', () => {
      expect(() => {
        executeOrder(portfolioWithHoldings, {
          symbol: 'GOOGL',
          mode: 'SELL',
          shares: 1,
          price: 175,
        });
      }).toThrow(/Insufficient shares: Owned 0, Attempted to sell 1/);
    });
  });

  describe('Prevention of Quantity Inversion & Slippage Invariance (Audit Flaw 1)', () => {
    test('ensures share count remains invariant when market price slips downward during order execution', () => {
      const initialPortfolio = {
        id: 'portfolio-slippage',
        title: 'Portfolio test',
        startingCash: 10000.0,
        cash: 1000.0,
        positions: [
          {
            id: 'pos-NVDA',
            symbol: 'NVDA',
            name: 'NVIDIA',
            shares: 10.0,
            avgCost: 100.0,
            totalCost: 1000.0,
          },
        ],
      };

      // Scenario: User placed a share-based order for 10 shares at quote $100.
      // At execution time, price slipped to $95.
      const orderParams = {
        symbol: 'NVDA',
        mode: 'SELL',
        shares: 10.0,
        orderCost: 1000.0,
        isCashOrder: false,
      };

      const fillPrice = 95.0;
      const executableShares = orderParams.isCashOrder
        ? Math.floor((orderParams.orderCost / fillPrice + Number.EPSILON) * 10000) / 10000
        : orderParams.shares;

      expect(executableShares).toBe(10.0);

      const summary = executeOrder(initialPortfolio, {
        symbol: orderParams.symbol,
        mode: orderParams.mode,
        shares: executableShares,
        price: fillPrice,
      });

      expect(summary.success).toBe(true);
      expect(summary.shares).toBe(10.0);
      expect(summary.fillPrice).toBe(95.0);
      expect(summary.orderCost).toBe(950.0);
      expect(summary.newCash).toBe(1950.0);
      expect(summary.newPositions.length).toBe(0);
    });

    test('accurately calculates shares for cash-denominated trades', () => {
      const orderParams = {
        symbol: 'NVDA',
        mode: 'BUY',
        shares: 10.0,
        orderCost: 1000.0,
        isCashOrder: true,
      };

      const fillPrice = 95.0;
      const executableShares = orderParams.isCashOrder
        ? Math.floor((orderParams.orderCost / fillPrice + Number.EPSILON) * 10000) / 10000
        : orderParams.shares;

      expect(executableShares).toBe(10.5263);

      const summary = executeOrder(basePortfolio, {
        symbol: orderParams.symbol,
        mode: orderParams.mode,
        shares: executableShares,
        price: fillPrice,
      });

      expect(summary.shares).toBe(10.5263);
      expect(summary.orderCost).toBeCloseTo(999.9985, 2);
    });
  });

  describe('Multi-Order Lifecycle State Transitions', () => {
    test('correctly tracks state across complex sequence of BUYs, partial SELLs, and liquidation', () => {
      let state = { ...basePortfolio };

      // 1. Buy 20 AMD @ $100 = $2,000 -> Cash: $8,000
      let exec = executeOrder(state, { symbol: 'AMD', mode: 'BUY', shares: 20, price: 100 });
      state = { ...state, cash: exec.newCash, positions: exec.newPositions };
      expect(state.cash).toBe(8000.0);

      // 2. Buy 10 AMD @ $160 = $1,600 -> Cash: $6,400. Blended avg: (2000 + 1600) / 30 = $120
      exec = executeOrder(state, { symbol: 'AMD', mode: 'BUY', shares: 10, price: 160 });
      state = { ...state, cash: exec.newCash, positions: exec.newPositions };
      expect(state.cash).toBe(6400.0);
      expect(state.positions[0].shares).toBe(30);
      expect(state.positions[0].avgCost).toBe(120.0);
      expect(state.positions[0].totalCost).toBe(3600.0);

      // 3. Buy 15 INTC @ $30 = $450 -> Cash: $5,950
      exec = executeOrder(state, { symbol: 'INTC', mode: 'BUY', shares: 15, price: 30 });
      state = { ...state, cash: exec.newCash, positions: exec.newPositions };
      expect(state.cash).toBe(5950.0);
      expect(state.positions.length).toBe(2);

      // 4. Sell 10 AMD @ $150 = $1,500 proceeds -> Cash: $7,450. AMD remaining: 20 @ $120 = $2,400
      exec = executeOrder(state, { symbol: 'AMD', mode: 'SELL', shares: 10, price: 150 });
      state = { ...state, cash: exec.newCash, positions: exec.newPositions };
      expect(state.cash).toBe(7450.0);
      const amdPos = state.positions.find((p) => p.symbol === 'AMD');
      expect(amdPos.shares).toBe(20);
      expect(amdPos.avgCost).toBe(120.0);
      expect(amdPos.totalCost).toBe(2400.0);

      // 5. Liquidate remaining 20 AMD @ $140 = $2,800 proceeds -> Cash: $10,250.
      exec = executeOrder(state, { symbol: 'AMD', mode: 'SELL', shares: 20, price: 140 });
      state = { ...state, cash: exec.newCash, positions: exec.newPositions };
      expect(state.cash).toBe(10250.0);
      expect(state.positions.length).toBe(1);
      expect(state.positions[0].symbol).toBe('INTC');

      // 6. Liquidate all 15 INTC @ $40 = $600 proceeds -> Cash: $10,850.
      exec = executeOrder(state, { symbol: 'INTC', mode: 'SELL', shares: 15, price: 40 });
      state = { ...state, cash: exec.newCash, positions: exec.newPositions };
      expect(state.cash).toBe(10850.0);
      expect(state.positions.length).toBe(0);

      expect(state.cash - basePortfolio.startingCash).toBe(850.0);
    });
  });
});
