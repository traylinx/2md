const { Queue } = require('bullmq');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

let connection = null;
let convertQueue = null;
let batchQueue = null;
let crawlQueue = null;
let agentifyQueue = null;

if (REDIS_URL) {
  const redisOpts = { maxRetriesPerRequest: null };
  if (REDIS_URL.startsWith('rediss://')) {
    redisOpts.tls = {};
  }

  connection = new Redis(REDIS_URL, redisOpts);

  convertQueue  = new Queue('2md-convert',  { connection });
  batchQueue    = new Queue('2md-batch',    { connection });
  crawlQueue    = new Queue('2md-crawl',    { connection });
  agentifyQueue = new Queue('2md-agentify', { connection });
} else {
  console.log('ℹ️  REDIS_URL not set — queue system disabled (local mode).');
}

const DEFAULT_JOB_OPTS = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail:     { age: 86400 },
};

async function addConvertJob(jobId, data) {
  if (!convertQueue) return null;
  return convertQueue.add(jobId, data, { ...DEFAULT_JOB_OPTS, jobId });
}

async function addBatchJob(jobId, data) {
  if (!batchQueue) return null;
  return batchQueue.add(jobId, data, { ...DEFAULT_JOB_OPTS, jobId, timeout: 600000 });
}

async function addCrawlJob(jobId, data) {
  if (!crawlQueue) return null;
  return crawlQueue.add(jobId, data, { ...DEFAULT_JOB_OPTS, jobId, timeout: 600000 });
}

async function addAgentifyJob(jobId, data) {
  if (!agentifyQueue) return null;
  return agentifyQueue.add(jobId, data, { ...DEFAULT_JOB_OPTS, jobId, timeout: 900000 });
}

async function publishLog(jobId, line) {
  if (!connection) return;
  await connection.publish(`job:logs:${jobId}`, line);
}

async function appendLogBuffer(jobId, line) {
  if (!connection) return;
  await connection.append(`job:logbuffer:${jobId}`, line);
  await connection.expire(`job:logbuffer:${jobId}`, 3600);
}

async function getLogBuffer(jobId) {
  if (!connection) return '';
  return await connection.get(`job:logbuffer:${jobId}`) || '';
}

module.exports = {
  connection,
  convertQueue,
  batchQueue,
  crawlQueue,
  agentifyQueue,
  addConvertJob,
  addBatchJob,
  addCrawlJob,
  addAgentifyJob,
  publishLog,
  appendLogBuffer,
  getLogBuffer,
};
