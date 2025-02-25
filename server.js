require("dotenv").config();
const express = require("express");
const AWS = require("aws-sdk");
const winston = require("winston");
require("winston-daily-rotate-file");

const transport = new winston.transports.DailyRotateFile({
  filename: "logs/server-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
});

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [transport, new winston.transports.Console()],
});

const app = express();
app.use(express.json());

AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS();

app.post("/", async (req, res) => {
  const { deviceCode, time, Level, Flow, Energy } = req.body;

  if (!deviceCode || !time || !Level || !Flow || !Energy) {
    logger.warn("Invalid payload received");
    return res.status(400).json({ error: "Invalid payload" });
  }

  const messageBody = JSON.stringify({ deviceCode, time, Level, Flow, Energy });

  const params = {
    QueueUrl: process.env.AWS_SQS_QUEUE_URL,
    MessageBody: messageBody,
  };

  try {
    await sqs.sendMessage(params).promise();
    logger.info(
      `Data received LOG => ${deviceCode} : ${time} : ${Level} : ${Flow} : ${Energy}`
    );
    res.json({ message: "Data received and queued" });
  } catch (error) {
    logger.error("SQS Error:", error);
    res.status(500).json({ error: "Failed to queue message" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
