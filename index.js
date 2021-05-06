const express = require("express");
const TradingService = require("./trading-service");
const tradingService = new TradingService();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/account/summary", (req, res) => {
  tradingService.getAccount().then((account) => res.json(account));
});

app.get("/orders", (req, res) => {
  tradingService.getOrders(req.query.status).then((orders) => res.json(orders));
});

app.get("/orders/cancel", (req, res) => {
  tradingService.cancelAllOrders().then(
    () => res.json({ success: true }),
    () => res.json({ success: false })
  );
});

app.post("/orders/create", (req, res) => {
  tradingService
    .createOrder({
      symbol: req.body.symbol,
      qty: req.body.qty,
      side: req.body.side,
    })
    .then(
      (order) => res.json(order),
      () => res.send("Failed to create order")
    );
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
