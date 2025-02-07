require("dotenv").config();
const AWS = require("aws-sdk");
const pgp = require("pg-promise")();
const winston = require("winston");
require("winston-daily-rotate-file");

const transport = new winston.transports.DailyRotateFile({
  filename: "logs/application-%DATE%.log",
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

AWS.config.update({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS();
const queueUrl = process.env.AWS_SQS_QUEUE_URL;

const db = pgp(process.env.DATABASE_URL);

async function createTableIfNotExists() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS water_data (
      id SERIAL PRIMARY KEY,
      device_id VARCHAR(255) NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      level FLOAT NOT NULL
    );
  `;

  try {
    await db.none(createTableQuery);
    // console.log("Table 'water_data' ensured to exist.");
  } catch (error) {
    logger.error("Error creating table:", error);
  }
}

async function processQueue() {
  await createTableIfNotExists();

  const params = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 5,
  };

  try {
    const data = await sqs.receiveMessage(params).promise();
    if (!data.Messages) return;

    for (const msg of data.Messages) {
      const { deviceId, timestamp, level } = JSON.parse(msg.Body);

      await db.none(
        "INSERT INTO water_data (device_id, timestamp, level) VALUES ($1, $2, $3)",
        [deviceId, timestamp, level]
      );

      await sqs
        .deleteMessage({
          QueueUrl: queueUrl,
          ReceiptHandle: msg.ReceiptHandle,
        })
        .promise();
      logger.info(`Processed message: ${msg.Body}`);
    }
  } catch (error) {
    logger.error("SQS Error:", error);
  }
}

setInterval(processQueue, 5000);
