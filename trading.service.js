require("dotenv").config();
const Alpaca = require("@alpacahq/alpaca-trade-api");
const USE_POLYGON = false; // by default we use the Alpaca data stream but you can change that
const axios = require("axios");
const TIINGO_BASE_URL = "https://api.tiingo.com/";
const tiingoClient = axios.create({
  baseURL: TIINGO_BASE_URL,
  timeout: 2500,
  headers: { "Content-Type": "application/json" },
});

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

  lastTrade(symbol) {
    return axios
      .get(
        `${TIINGO_BASE_URL}iex/${symbol}?token=${process.env.TIINGO_API_TOKEN}`
      )
      .then((res) => res.data);
  }
}

module.exports = TradingService;
