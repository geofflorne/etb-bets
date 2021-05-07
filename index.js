require("dotenv").config();
const { createEventAdapter } = require("@slack/events-api");
const { WebClient, LogLevel } = require("@slack/web-api");
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackEvents = createEventAdapter(slackSigningSecret);
const client = new WebClient(process.env.SLACK_TOKEN, {
  logLevel: LogLevel.DEBUG,
});
const port = process.env.PORT || 3000;
const TradingService = require("./trading.service");
const tradingService = new TradingService();
const BOT_USER = "U02175V34HJ";

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on("app_mention", async (event) => {
  if (event.user === BOT_USER) return;

  if (event.text.indexOf("help") >= 0) {
    sendBlock(event.channel, helpBlocks);
  } else if (
    event.text.indexOf("$buy") >= 0 ||
    event.text.indexOf("$sell") >= 0
  ) {
    try {
      const order = parseOrder(event.text);
      tradingService
        .createOrder(order)
        .then((res) => {
          if (res) {
            console.log(res);
            sendMessage(
              event.channel,
              `Order placed: ${res.side} ${res.qty} ${res.symbol}`
            );
          } else {
            // can this happen? how to handle?
          }
        })
        .catch((err) => {
          console.log(err);
          sendMessage(event.channel, `Error: ${err.error.message}`);
        });
    } catch (err) {
      await sendMessage(event.channel, "Could not parse your order.");
    }
  } else if (event.text.indexOf("$summary") >= 0) {
    if (canParseSummary(event.text)) {
      let summaryBlocks;

      tradingService
        .getAccount()
        .then((res) => {
          if (res) {
            summaryBlocks = summaryDataOrganized(res);
            sendBlock(event.channel, summaryBlocks);
            // summaryDescription = analyzeAccountData(res);
          }
        })
        .then(() => {
          tradingService.getOrders().then((res) => {
            if (res) {
              sendBlock(event.channel, analyzeOrdersData(res));
            }
          });
        });
      // then(() => {
      //   const positions = tradingService.getPositions()
      //   .then(res => {
      //     if (res) {
      // sendMessage(event.channel, summaryDescription + analyzePositionsData(res))
      //   }
      // })
      // });
    } else {
      await sendMessage(
        event.channel,
        "Could not parse your summary request, try `@ETB Trader $summary`"
      );
    }
  } else if (event.text.indexOf("$positions") >= 0) {
    const positionParts = event.text.split(" ");
    console.log(positionParts);
    if (positionParts.length === 2) {
      //$positions
      tradingService
        .getPositions()
        .then((res) => {
          if (res) {
            const positions = getPositionsSummary(res);
            sendBlock(event.channel, positions);
          }
        })
        .catch((err) => {
          console.log(err);
          sendMessage(event.channel, `Error: ${err.error.message}`);
        });
    } else if (positionParts.length === 3) {
      //$positions <ticker>
      tradingService
        .getPosition(positionParts[2])
        .then((res) => {
          if (res) {
            const position = getPositionDetails(res);
            sendBlock(event.channel, position);
          }
        })
        .catch((err) => {
          console.log(err);
          sendMessage(event.channel, `Error: ${err.error.message}`);
        });
    } else {
      sendMessage(event.channel, `Error: Could not parse message`);
    }
  } else if (event.text.indexOf("$YOLO") >= 0) {
    if (canParseYolo(event.text)) {
      tradingService.createOrder(getYoloOrder());
    } else {
      await sendUnknownCommandMessage(event);
    }
  } else if (event.text.indexOf("$lastTrade") >= 0) {
    if (canParseLastTrade(event.text)) {
      const symbol = event.text.split(" ")[2];
      console.log(symbol);
      tradingService.lastTrade(symbol).then((data) => {
        sendMessage(event.channel, JSON.stringify(data));
      });
    } else {
      await sendUnknownCommandMessage(event);
    }
  } else if (event.text.indexOf("$news") >= 0) {
    tradingService.news().then((data) => {
      sendMessage(event.channel, JSON.stringify(data));
    });
  } else {
    await sendUnknownCommandMessage(event);
  }
});

(async () => {
  // Start the built-in server
  console.log(slackSigningSecret);
  const server = await slackEvents.start(port);

  // Log a message when the server is ready
  console.log(`Listening for events on ${server.address().port}`);
})();

function parseOrder(text) {
  const parts = text.split(" ");

  console.log("parts:");
  console.log(parts);

  if (
    parts.length !== 4 ||
    (parts[1].toLowerCase() !== "$buy" && parts[1].toLowerCase() !== "$sell") ||
    isNaN(parts[2])
  ) {
    throw new Error("Invalid order: " + text);
  }

  return {
    side: parts[1].toLowerCase().substr(1),
    qty: parts[2],
    symbol: parts[3].toUpperCase(),
  };
}

async function sendMessage(channel, msg) {
  const response = await client.chat.postMessage({
    channel: channel,
    text: msg,
  });
  //console.log(response);
}

async function sendBlock(channel, blocks) {
  const response = await client.chat.postMessage({
    channel: channel,
    blocks,
  });
}

function canParseSummary(text) {
  const parts = text.split(" ");
  return parts.length == 2 && parts[1].toLowerCase() === "$summary";
}

function analyzeAccountData(accData) {
  return `Account #: ${accData.account_number}
  Status: ${accData.status}
  Currency: ${accData.currency}
  Cash Balance: $${accData.cash}
  Portfolio Value (Equity): $${accData.equity}
  Last Portfolio Value (Last Equity): $${accData.last_equity}
  Today's Profit/Loss: ${getTodaysProfitLoss(accData)}
  Buying Power: $${accData.buying_power}
  Daytrade Count (Last 5 Trading Days): ${accData.daytrade_count}`;
}

function getTodaysProfitLoss(accData) {
  const { equity, last_equity } = accData;
  const diff = Math.abs(equity - last_equity).toFixed(2);
  const pDiff = ((100 * diff) / last_equity).toFixed(2);

  if (parseFloat(equity) >= parseFloat(last_equity)) {
    return `$${diff} | ${pDiff}%`;
  } else {
    return `-$${diff} | -${pDiff}%`;
  }
}

function analyzeOrdersData(orderData) {
  let ordersDescription = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Open Orders",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [],
      accessory: {
        type: "image",
        image_url: "https://i.imgur.com/xFPkFaV.jpg",
        alt_text: "dog money",
      },
    },
  ];

  orderData.forEach((order) => {
    const orderCell = {
      type: "mrkdwn",
      text: `*${order.symbol}*\n${order.side} ${order.qty}`,
    };

    ordersDescription[1]["fields"].push(orderCell);
  });

  return ordersDescription;
}

function getPositionsSummary(positionsData) {
  let positionDescription = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Current Positions",
        emoji: true,
      },
    },
  ];

  positionsData.forEach((position) => {
    positionDescription.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${position.symbol} ${position.side} ${position.qty}`,
      },
    });
  });

  positionDescription.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "@ETB Trader $positions <tickerSymbol> for more details",
    },
  });

  return positionDescription;
}

function getPositionDetails(positionData) {
  const p = positionData;
  console.log(p);
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${p.symbol} ${p.side} ${p.qty}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Cost Basis*\n$${p.cost_basis}`,
        },
        {
          type: "mrkdwn",
          text: `*Market Value*\n$${p.market_value}`,
        },
        {
          type: "mrkdwn",
          text: `*Average Entry Price*\n$${p.avg_entry_price}`,
        },
        {
          type: "mrkdwn",
          text: `*Current Share Price*\n$${p.current_price}`,
        },
        {
          type: "mrkdwn",
          text: `*Today's Profit/Loss*\n$${p.unrealized_intraday_pl} | ${Number(
            p.unrealized_intraday_plpc
          ).toFixed(5)}%`,
        },
        {
          type: "mrkdwn",
          text: `*Total Profit/Loss*\n$${p.unrealized_pl} | ${Number(
            p.unrealized_plpc
          ).toFixed(5)}%`,
        },
      ],
    },
  ];
}

const summaryDataOrganized = (accData) => {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Account Summary",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Account #:*\n${accData.account_number}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Status*\n${accData.status}`,
        },
        {
          type: "mrkdwn",
          text: `*Currency*\n${accData.currency}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Cash Balance*\n$${accData.cash}`,
        },
        {
          type: "mrkdwn",
          text: `*Portfolio Value*\n$${accData.equity}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Last Portfolio Value*\n$${accData.last_equity}`,
        },
        {
          type: "mrkdwn",
          text: `*Today's Profit/Loss*\n${getTodaysProfitLoss(accData)}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Buying Power*\n$${accData.buying_power}`,
        },
        {
          type: "mrkdwn",
          text: `*Daytrade Count (Last 5 Trading Days)*\n${accData.daytrade_count}`,
        },
      ],
    },
    {
      type: "divider",
    },
  ];
};

const helpBlocks = [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "Hey there 👋 I'm ETB Trader. I'm here to help you make trades and manage a portfolio in Slack.\nHere is a list of commands for reference:",
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*1️⃣ Use the `$summary` command*. `@ETB Trader $summary`",
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "*2️⃣ Use the `$buy` command*. `@ETB Trader $buy <numShares> <tickerSymbol>`",
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "*3️⃣ Use the `$sell` command*. `@ETB Trader $sell <numShares> <tickerSymbol>`",
    },
  },
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "*4️⃣ Use the `$positions` command*. `@ETB Trader $positions` or `@ETB Trader $positions <tickerSymbol>`",
    },
  },
  {
    type: "divider",
  },
  {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "❓Get help at any time with *help* in a mention at me",
      },
    ],
  },
];

function canParseYolo(text) {
  const parts = text.split(" ");
  return parts.length == 2 && parts[1].toUpperCase() === "$YOLO";
}

function getYoloOrder() {
  return {
    side: "buy",
    qty: (Math.random() * 420 + 1).toFixed(),
    symbol: "YOLO",
  };
}

async function sendUnknownCommandMessage(event) {
  await sendMessage(
    event.channel,
    "Unknown command. Use `@ETB Trader $help` for valid commands."
  );
}

function canParseLastTrade(text) {
  const parts = text.split(" ");
  return parts.length === 3 && parts[1].toLowerCase() === "$lasttrade";
}
