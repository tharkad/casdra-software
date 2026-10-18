// play/sheet_trade.js: the trade and hire sheets (buying, selling, paying with goods, drinks, boons, hiring natives).
// The trade and hire sheets (P2): built in screens/kit/trade.js, hire.js and boon.js as sheet content, mounted in today's frame by kit/common.js mountSheet().
import { hireContent } from '../kit/hire.js';
import { mountSheet } from '../kit/common.js';
import { tradeContent } from '../kit/trade.js';

export function tradeSheet(G, p) { return mountSheet(G, tradeContent(G, p)); }

export function hireSheet(G, p) { return mountSheet(G, hireContent(G, p)); }
