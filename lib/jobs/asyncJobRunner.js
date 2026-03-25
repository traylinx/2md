const { spawn } = require('child_process');
const jobRegistry = require('../jobRegistry');
const { deliverWebhook } = require('./webhookDelivery');

function runAsyncJob({ jobId, spawnArgs, cwd, webhookUrl, buildResult, onStdout, onStderr }) {
  const child = spawn('node', spawnArgs, { cwd });
  let logBuffer = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    logBuffer += text;
    if (onStdout) onStdout(text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    logBuffer += text;
    if (onStderr) onStderr(text);
  });

  child.on('close', async (code) => {
    const result = buildResult ? buildResult(code, logBuffer) : { exitCode: code };

    // Generate secure download URL for the completed job
    const { generateDownloadToken } = require('./downloadToken');
    const { token } = generateDownloadToken(jobId);
    // Base URL is typically not deeply known here, so we provide an absolute path 
    // Clients can prefix with their origin
    const downloadUrl = `/api/download/job/${jobId}?token=${token}`;

    const jobPatch = {
      status: code === 0 || result.success !== false ? 'done' : 'failed',
      completedAt: new Date().toISOString(),
      inlineLog: logBuffer.substring(0, 50000),
      downloadUrl,
      ...result.jobPatch,
    };

    if (result.error) {
      jobPatch.error = result.error;
    }

    jobRegistry.updateJob(jobId, jobPatch);

    if (webhookUrl) {
      const job = jobRegistry.getJob(jobId);
      const webhookPayload = {
        job_id: jobId,
        status: jobPatch.status,
        type: job?.type || 'unknown',
        completed_at: jobPatch.completedAt,
        download_url: downloadUrl,
        ...(result.webhookData || {}),
      };

      jobRegistry.updateJob(jobId, { webhookStatus: 'pending' });

      const secret = process.env.WEBHOOK_SECRET || null;
      const delivery = await deliverWebhook(webhookUrl, webhookPayload, { secret, jobId });

      jobRegistry.updateJob(jobId, {
        webhookStatus: delivery.delivered ? 'delivered' : 'failed',
        webhookError: delivery.error || null,
      });
    }

    const job = jobRegistry.getJob(jobId);
    if (job && job.email) {
      const { publishJobNotification } = require('./snsNotify');
      // Require absolute URL for email links
      const baseUrl = process.env.PRODUCTION_API_URL || 'https://2md.traylinx.com';
      const absoluteDownloadUrl = `${baseUrl}${downloadUrl}`;
      
      const pageCount = result.jobPatch?.resultSummary?.pagesConverted || result.webhookData?.pages_converted || 1;
      
      const notifyResult = await publishJobNotification({
        jobId,
        email: job.email,
        url: job.url || 'Batch Crawl',
        downloadUrl: absoluteDownloadUrl,
        pageCount,
      });

      jobRegistry.updateJob(jobId, {
        emailStatus: notifyResult.published ? 'sent' : 'failed',
        emailError: notifyResult.error || null,
      });
    }
  });

  child.on('error', (err) => {
    jobRegistry.updateJob(jobId, {
      status: 'failed',
      error: err.message,
      completedAt: new Date().toISOString(),
    });
  });

  return { child, getLog: () => logBuffer };
}

module.exports = { runAsyncJob };
