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

describe('Portfolio Order Execution Engine', () => {
  let basePortfolio;
  let portfolioWithHoldings;

  beforeEach(() => {
    basePortfolio = {
      id: 'portfolio-test-1',
      title: 'Portfolio test',
      startingCash: 10000.0,
      cash: 10000.0,
      positions: [],
      createdAt: 1700000000000,
    };
    
    portfolioWithHoldings = {
      id: 'portfolio-test-1',
      title: 'Portfolio test',
      startingCash: 10000.0,
      cash: 5350.0,
      positions: [
        {
          id: 'pos-NVDA-1',
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          shares: 10.0,
          avgCost: 220.0,
          totalCost: 2200.0,
        },
        {
          id: 'pos-MSFT-1',
          symbol: 'MSFT',
          name: 'Microsoft Corp',
          shares: 5.0,
          avgCost: 490.0,
          totalCost: 2450.0,
        },
      ],
    };
  });

  test('throws when target portfolio is undefined or null', () => {
    expect(() => {
      executeOrder(null, { symbol: 'AAPL', mode: 'BUY', shares: 5, price: 315 });
    }).toThrow('Target portfolio not found');
  });

  test('throws when symbol is missing or empty', () => {
    expect(() => {
      executeOrder(basePortfolio, { symbol: '', mode: 'BUY', shares: 5, price: 315 });
    }).toThrow('Invalid order arguments');
  });

  test('throws when shares count is zero or negative', () => {
    expect(() => {
      executeOrder(basePortfolio, { symbol: 'AAPL', mode: 'BUY', shares: 0, price: 315 });
    }).toThrow('Invalid order arguments');

    expect(() => {
      executeOrder(basePortfolio, { symbol: 'AAPL', mode: 'BUY', shares: -10, price: 315 });
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

  test('opens a fresh position and deducts cash accurately', () => {
    const summary = executeOrder(basePortfolio, {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      mode: 'BUY',
      shares: 10,
      price: 226.5,
    });

    expect(summary.success).toBe(true);
    expect(summary.mode).toBe('BUY');
    expect(summary.symbol).toBe('NVDA');
    expect(summary.shares).toBe(10);
    expect(summary.fillPrice).toBe(226.5);
    expect(summary.orderCost).toBe(2265.0);
    expect(summary.newCash).toBe(7735.0);

    expect(summary.newPositions.length).toBe(1);
    const pos = summary.newPositions[0];
    expect(pos.symbol).toBe('NVDA');
    expect(pos.shares).toBe(10);
    expect(pos.avgCost).toBe(226.5);
    expect(pos.totalCost).toBe(2265.0);
  });

  test('blends weighted average cost when adding to existing position', () => {
    // First buy: 10 shares @ $310 = $3,100 cost
    const step1 = executeOrder(basePortfolio, {
      symbol: 'AAPL',
      mode: 'BUY',
      shares: 10,
      price: 310,
    });

    const updatedPortfolio = {
      ...basePortfolio,
      cash: step1.newCash,
      positions: step1.newPositions,
    };

    // Second buy: 10 shares @ $320 = $3,200 cost... blended avg = $315
    const step2 = executeOrder(updatedPortfolio, {
      symbol: 'AAPL',
      mode: 'BUY',
      shares: 10,
      price: 320,
    });

    expect(step2.newCash).toBe(3700.0);
    expect(step2.newPositions.length).toBe(1);

    const pos = step2.newPositions[0];
    expect(pos.shares).toBe(20);
    expect(pos.avgCost).toBe(315.0);
    expect(pos.totalCost).toBe(6300.0);
  });

  test('handles fractional shares and uneven prices in cost basis calculations', () => {
    // First buy: 2.5 shares @ $362.40 = $906.00
    const step1 = executeOrder(basePortfolio, {
      symbol: 'TSLA',
      mode: 'BUY',
      shares: 2.5,
      price: 362.4,
    });

    const updatedPortfolio = {
      ...basePortfolio,
      cash: step1.newCash,
      positions: step1.newPositions,
    };

    // 1.5 shares @ $372.80 = $559.20
    // Total shares: 4.0, Total cost: $1,465.20, Avg cost: $366.30
    const step2 = executeOrder(updatedPortfolio, {
      symbol: 'TSLA',
      mode: 'BUY',
      shares: 1.5,
      price: 372.8,
    });

    const pos = step2.newPositions[0];
    expect(pos.shares).toBe(4);
    expect(pos.avgCost).toBe(366.3);
    expect(pos.totalCost).toBe(1465.2);
    expect(step2.newCash).toBeCloseTo(10000 - 1465.2, 2);
  });

  test('throws Insufficient funds error when order exceeds available cash', () => {
    expect(() => {
      executeOrder(basePortfolio, {
        symbol: 'AMZN',
        mode: 'BUY',
        shares: 50,
        price: 256,
      });
    }).toThrow(/Insufficient funds/);
  });


  beforeEach(() => {
  });

  test('executes partial sell, maintaining avgCost and updating totalCost', () => {
    // Sell 4 shares of NVDA at market price $230 = $920 proceeds
    const summary = executeOrder(portfolioWithHoldings, {
      symbol: 'NVDA',
      mode: 'SELL',
      shares: 4,
      price: 230,
    });

    expect(summary.success).toBe(true);
    expect(summary.newCash).toBe(6270.0);
    expect(summary.newPositions.length).toBe(2);

    const nvdaPos = summary.newPositions.find((p) => p.symbol === 'NVDA');
    expect(nvdaPos.shares).toBe(6.0);
    expect(nvdaPos.avgCost).toBe(220.0);
    expect(nvdaPos.totalCost).toBe(1320.0);
  });

  test('fully closes and removes position when all shares are liquidated', () => {
    // Sell all 10 shares of NVDA at $225
    const summary = executeOrder(portfolioWithHoldings, {
      symbol: 'NVDA',
      mode: 'SELL',
      shares: 10,
      price: 225,
    });

    expect(summary.newCash).toBe(7600.0);
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
        price: 226,
      });
    }).toThrow(/Insufficient shares: Owned 10, Attempted to sell 10.01/);
  });

  test('throws Insufficient shares error when selling a symbol not owned in portfolio', () => {
    expect(() => {
      executeOrder(portfolioWithHoldings, {
        symbol: 'GOOGL',
        mode: 'SELL',
        shares: 1,
        price: 340,
      });
    }).toThrow(/Insufficient shares: Owned 0, Attempted to sell 1/);
  });

  
  test('correctly tracks state across complex sequence of BUYs, partial SELLs, and liquidation', () => {
    let state = { ...basePortfolio };

    // 1. Buy 10 AMD @ $500 = $5,000 -> Cash: $5,000
    let exec = executeOrder(state, { symbol: 'AMD', mode: 'BUY', shares: 10, price: 500 });
    state = { ...state, cash: exec.newCash, positions: exec.newPositions };
    expect(state.cash).toBe(5000.0);

    // 2. Buy 5 AMD @ $530 = $2,650 -> Cash: $2,350. Blended avg: (5000 + 2650) / 15 = $510
    exec = executeOrder(state, { symbol: 'AMD', mode: 'BUY', shares: 5, price: 530 });
    state = { ...state, cash: exec.newCash, positions: exec.newPositions };
    expect(state.cash).toBe(2350.0);
    expect(state.positions[0].shares).toBe(15);
    expect(state.positions[0].avgCost).toBe(510.0);
    expect(state.positions[0].totalCost).toBe(7650.0);

    // 3. Buy 15 INTC @ $105 = $1,575 -> Cash: $775
    exec = executeOrder(state, { symbol: 'INTC', mode: 'BUY', shares: 15, price: 105 });
    state = { ...state, cash: exec.newCash, positions: exec.newPositions };
    expect(state.cash).toBe(775.0);
    expect(state.positions.length).toBe(2);

    // 4. Sell 5 AMD @ $520 = $2,600 proceeds -> Cash: $3,375. AMD remaining: 10 @ $510 = $5,100
    exec = executeOrder(state, { symbol: 'AMD', mode: 'SELL', shares: 5, price: 520 });
    state = { ...state, cash: exec.newCash, positions: exec.newPositions };
    expect(state.cash).toBe(3375.0);
    const amdPos = state.positions.find((p) => p.symbol === 'AMD');
    expect(amdPos.shares).toBe(10);
    expect(amdPos.avgCost).toBe(510.0);
    expect(amdPos.totalCost).toBe(5100.0);

    // 5. Sell remaining 10 AMD @ $515 = $5,150 proceeds -> Cash: $8,525.
    exec = executeOrder(state, { symbol: 'AMD', mode: 'SELL', shares: 10, price: 515 });
    state = { ...state, cash: exec.newCash, positions: exec.newPositions };
    expect(state.cash).toBe(8525.0);
    expect(state.positions.length).toBe(1);
    expect(state.positions[0].symbol).toBe('INTC');

    // 6. Sell all 15 INTC @ $110 = $1,650 proceeds -> Cash: $10,175.
    exec = executeOrder(state, { symbol: 'INTC', mode: 'SELL', shares: 15, price: 110 });
    state = { ...state, cash: exec.newCash, positions: exec.newPositions };
    expect(state.cash).toBe(10175.0);
    expect(state.positions.length).toBe(0);

    expect(state.cash - basePortfolio.startingCash).toBe(175.0);
  });
});
