import * as amqp from 'amqplib';
import Redis from 'ioredis';
import pino from 'pino';
import { dispatch } from './handlers';

const log = pino({ level: process.env.LOG_LEVEL ?? 'info' });

const EVENT_EXCHANGE = 'commerce.events';
const QUEUE_NAME = 'worker.main';
const DEDUP_TTL_SECONDS = 60 * 60 * 24; // a message redelivered more than a day later is unusual enough to just re-process

async function main() {
  const rabbitUrl = process.env.RABBITMQ_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!rabbitUrl) throw new Error('RABBITMQ_URL not set');
  if (!redisUrl) throw new Error('REDIS_URL not set');

  const redis = new Redis(redisUrl);
  const connection = await amqp.connect(rabbitUrl);
  const channel = await connection.createChannel();

  await channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
  // Durable queue survives a broker restart with unacked messages intact —
  // this is what makes the event bus actually reliable rather than "best
  // effort." '#' binds to every routing key; a second consumer process
  // could bind to just 'inventory.*' if it only cares about stock events.
  const queue = await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(queue.queue, EVENT_EXCHANGE, '#');

  // Process one message at a time per consumer — with multiple worker
  // replicas (see infra/k8s), RabbitMQ round-robins unacked messages across
  // them, which is the actual mechanism that makes horizontal worker
  // scaling work without extra coordination code.
  await channel.prefetch(1);

  log.info(`Worker listening on queue "${QUEUE_NAME}", bound to all events`);

  channel.consume(queue.queue, async (msg) => {
    if (!msg) return;

    const messageId = msg.properties.messageId;
    try {
      // Idempotent consumption: RabbitMQ's at-least-once delivery means the
      // same message CAN arrive twice (e.g. this process crashes after
      // processing but before ack). SETNX makes "already handled" a cheap,
      // race-free check rather than trusting delivery count alone.
      if (messageId) {
        const isNew = await redis.set(`worker:seen:${messageId}`, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
        if (!isNew) {
          log.debug({ messageId }, 'Duplicate delivery, skipping');
          channel.ack(msg);
          return;
        }
      }

      const event = JSON.parse(msg.content.toString());
      await dispatch(event, log);
      channel.ack(msg);
    } catch (err) {
      log.error({ err, messageId }, 'Handler failed — requeuing');
      // requeue=true: transient failures (e.g. a downstream API blip) get
      // retried. A poison message that always fails will loop — a real
      // deployment should add a dead-letter exchange with a retry cap
      // rather than requeue forever; noted here rather than silently
      // implying this handles that case.
      channel.nack(msg, false, true);
    }
  });

  process.on('SIGTERM', async () => {
    log.info('Shutting down gracefully...');
    await channel.close();
    await connection.close();
    await redis.quit();
    process.exit(0);
  });
}

main().catch((err) => {
  log.error({ err }, 'Worker failed to start');
  process.exit(1);
});
