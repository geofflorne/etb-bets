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
    try {
      sendBlock(event.channel, helpBlocks);
    }
    catch(err) {
      console.log(err);
      sendMessage(event.channel, `Error: ${err.error.message}`);
    }
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
      tradingService.createOrder(getYoloOrder())
      .then((res) => {
        if (res) {
          sendMessage(event.channel, `:rolling_on_the_floor_laughing: YOLO succeeded! Order placed: ${res.side} ${res.qty} ${res.symbol}`)
        }
      })
      .catch(err => {
        sendMessage(event.channel, `:face_vomiting: YOLO failed. You have brought shame and dishonour upon yourself.`)
      });
    } else {
      await sendUnknownCommandMessage(event);
    }
  } else if (event.text.indexOf("$lastTrade") >= 0) {
    if (canParseLastTrade(event.text)) {
      const symbol = event.text.split(" ")[2];
      tradingService.lastTrade(symbol).then((data) => {

        sendBlock(event.channel, getLastTradeBlock(data));

        //sendMessage(event.channel, JSON.stringify(data));
      })
      .catch((err) => {
        if (err.response && err.response.data && err.response.data.detail) {
          sendMessage(event.channel, `Error: ${err.response.data.detail}`);
        }
        else {
          sendMessage(event.channel, `An unknown error occurred.`);
        }
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
        text: `Open Orders (${orderData.length})`,
        emoji: true,
      },
    }
  ];

  if(orderData.length > 0) {
    const fields = orderData.map(order => {
      return {
        "type": "mrkdwn",
        "text": `*${order.symbol}* ${order.side} ${order.qty}: ${order.status}`
      }
    })

    ordersDescription.push({
      type: "section",
      fields: fields,
      accessory: {
        type: "image",
        image_url: "https://i.imgur.com/xFPkFaV.jpg",
        alt_text: "dog money",
      }
    })
  }

  return ordersDescription;
}

function getPositionsSummary(positionsData) {
  let positionDescription = [{
    "type": "header",
    "text": {
      "type": "plain_text",
      "text": "Current Positions",
      "emoji": true
    }
  },		
  {
    "type": "context",
    "elements": [
      {
        "type": "mrkdwn",
        "text": "Symbol | Side | Qty | Unrealized P/L%"
      }
    ]
  }];

  positionsData.forEach((position) => {
    positionDescription.push({
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": `*${position.symbol}* ${position.side} ${position.qty} ${Number(position.unrealized_plpc * 100).toFixed(3)}%`
			}
		});
  })
  
  positionDescription.push(
    {
			"type": "divider"
		},
    {
      "type": "context",
      "elements": [{
        "type": "mrkdwn",
        "text": "@ETB Trader $positions <tickerSymbol> for more details"
      }]
    }
  )

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
            p.unrealized_intraday_plpc * 100
          ).toFixed(5)}%`,
        },
        {
          type: "mrkdwn",
          text: `*Total Profit/Loss*\n$${p.unrealized_pl} | ${Number(
            p.unrealized_plpc * 100
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
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        "*5️⃣ Use the `$lastTrade` command*. `@ETB Trader $lastTrade <tickerSymbol>`",
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
  
  let symbol = ""
  let symbolLen = Math.floor(Math.random() * 4) + 1;
  for (let c = 0; c < symbolLen; c++) {
    symbol += String.fromCharCode(Math.floor(Math.random() * 26 + 65));
  }
  return { side: "buy", qty: (Math.random()*420 + 1).toFixed(), symbol: symbol };
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

function getLastTradeBlock(lastTradeData) {

  lastTradeBlocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Last Trade`,
        emoji: true,
      },
    }];

    lastTradeData.forEach(data => {
      lastTradeBlocks.push(...[{
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Symbol*\n${data.ticker}`,
          },
          {
            type: "mrkdwn",
            text: `*Last Price*\n$${data.last.toFixed(2)}`,
          },
          {
            type: "mrkdwn",
            text: `*Bid Price*\n$${data.bidPrice.toFixed(2)}`,
          },
          {
            type: "mrkdwn",
            text: `*Ask Price*\n$${data.askPrice.toFixed(2)}`,
          }, 
          {
            type: "mrkdwn",
            text: `*Opening Price*\n$${data.open.toFixed(2)}`,
          },       
          {
            type: "mrkdwn",
            text: `*Previous Close Price*\n$${data.prevClose.toFixed(2)}`,
          }
        ]
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Last Size*\n${data.lastSize}`
          },
          {
            type: "mrkdwn",
            text: `*Bid Size*\n${data.bidSize}`,
          },
          {
            type: "mrkdwn",
            text: `*Ask Size*\n${data.askSize}`,
          },
          {
            type: "mrkdwn",
            text: `*Volume*\n${data.volume}`,
          },
          {
            type: "mrkdwn",
            text: `*Last Sale Time*\n${new Date(data.lastSaleTimestamp).toUTCString()}`,
          }
        ] 
      }]);
    })

  return lastTradeBlocks;
}
