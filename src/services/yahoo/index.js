import { getSession } from './yahooSession';
import {
  fetchHistoricalData,
  getBoundaryAlignedTtl,
  applyLivePriceOverlay,
  TIMEFRAME_CONFIG,
  BOUNDARY_INTERVALS,
} from './yahooChartService';
import {
  fetchCompanyDescription,
  getMostRecentPrice,
  fetchQuote,
} from './yahooQuoteService';

export const yahooFinanceService = {
  fetchHistoricalData,
  getSession,
  fetchCompanyDescription,
  getMostRecentPrice,
  fetchQuote,
};

export {
  getBoundaryAlignedTtl,
  applyLivePriceOverlay,
  TIMEFRAME_CONFIG,
  BOUNDARY_INTERVALS,
};

export default yahooFinanceService;
