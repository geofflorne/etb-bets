require("dotenv").config();
const { createEventAdapter } = require("@slack/events-api");
const { startsWith } = require("lodash");
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const slackEvents = createEventAdapter(slackSigningSecret);
const port = process.env.PORT || 3000;

// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on("message", (event) => {
  console.log(event);

  if (isCommand(event.text)) {
    console.log("this is a command");
    console.log(parseCommand(event.text));
  } else {
    console.log("this is not a command");
  }
});

(async () => {
  // Start the built-in server
  const server = await slackEvents.start(port);

  // Log a message when the server is ready
  console.log(`Listening for events on ${server.address().port}`);
})();

function isCommand(text) {
  const normalizedText = text.toLowerCase();

  return (
    normalizedText.startsWith("$buy") || normalizedText.startsWith("$sell")
  );
}

function parseCommand(text) {
  text = text.replace("$", "");
  const parts = text.split(" ");

  return { side: parts[0], qty: parts[1], symbol: parts[2] };
}
