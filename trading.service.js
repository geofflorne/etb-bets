const Alpaca = require("@alpacahq/alpaca-trade-api");
const USE_POLYGON = false; // by default we use the Alpaca data stream but you can change that

class TradingService {
  constructor() {
    this.alpaca = new Alpaca({ usePolygon: USE_POLYGON });
  }

  // ACCOUNT
  getAccount() {
    return this.alpaca.getAccount();
  }

  // POSITIONS
  getPositions() {
    return this.alpaca.getPositions();
  }

  getPosition(ticker) {
    return this.alpaca.getPosition(ticker);
  }

  // ORDERS
  getOrders(status) {
    return this.alpaca.getOrders({ status });
  }

  createOrder({ symbol, qty, side }) {
    
    return this.alpaca.createOrder({
      symbol,
      qty,
      side,
      type: "market",
      time_in_force: "day",
    });
  }

  cancelAllOrders() {
    return this.alpaca.cancelAllOrders();
  }
}

module.exports = TradingService;

    