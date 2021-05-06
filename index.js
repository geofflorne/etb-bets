const Alpaca = require("@alpacahq/alpaca-trade-api");
const USE_POLYGON = false; // by default we use the Alpaca data stream but you can change that

const alpaca = new Alpaca({ usePolygon: USE_POLYGON });

// ACCOUNT API

alpaca.getAccount().then((account) => {
  console.log("Current Account:", account);
});

alpaca.getAccountConfigurations().then((accountCfgs) => {
  console.log("Current Account Configurations:", accountCfgs);
});

// ORDERS API

alpaca
  .createOrder({
    symbol: "AAPL", // any valid ticker symbol
    qty: 1,
    //notional, // qty or notional required, not both
    side: "buy", //'buy' | 'sell',
    type: "market", //market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop',
    time_in_force: "day", //'day' | 'gtc' | 'opg' | 'ioc',
    // limit_price: number, // optional,
    // stop_price: number, // optional,
    // client_order_id: string, // optional,
    // extended_hours: boolean, // optional,
    // order_class: string, // optional,
    // take_profit: object, // optional,
    // stop_loss: object, // optional,
    // trail_price: string, // optional,
    // trail_percent: string // optional,
  })
  .then((order) => {
    console.log("Order:", order);
  });

alpaca
  .getOrders({
    status: "all", //'open' | 'closed' | 'all',
    // after: //Date,
    // until: //Date,
    // limit: //number,
    // direction: //'asc' | 'desc'
  })
  .then((orders) => {
    console.log("Orders:", orders);
  });
