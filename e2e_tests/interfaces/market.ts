export interface Holding {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  currency: string;
}
export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  timestamp: number;
  marketState: string;
}
