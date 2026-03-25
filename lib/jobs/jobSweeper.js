const fs = require('fs');
const path = require('path');
const jobRegistry = require('../jobRegistry');
const { JOBS_DIR } = require('../config');

function removeDirectoryRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        removeDirectoryRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

function sweepExpiredJobs() {
  console.log('[Sweeper] Starting job expiration sweep...');
  let sweepCount = 0;
  
  try {
    // We use listJobs without clientId filtering to get everything
    const allJobs = jobRegistry.listJobs();
    const now = new Date();
    
    for (const job of allJobs) {
      // Delete if we have an explicit expiration date and it's in the past
      if (job.expiresAt && new Date(job.expiresAt) < now) {
        console.log(`[Sweeper] Deleting expired job ${job.id}`);
        
        // 1. Delete associated disk paths if present (like batch jobs' pages)
        const fullJobDef = jobRegistry.getJob(job.id);
        if (fullJobDef && fullJobDef.resultPath && fs.existsSync(fullJobDef.resultPath)) {
            removeDirectoryRecursive(fullJobDef.resultPath);
        }
        
        // 2. Delete the specific JSON file directly from registry
        const registryFile = path.join(require('../config').REGISTRY_DIR, `${job.id}.json`);
        if (fs.existsSync(registryFile)) {
          fs.unlinkSync(registryFile);
        }
        
        sweepCount++;
      }
    }
    
    console.log(`[Sweeper] Finished. Swept ${sweepCount} expired jobs.`);
  } catch (err) {
    console.error(`[Sweeper] Failed to sweep jobs: ${err.message}`);
  }
}

function startJobSweeper(intervalMs = 30 * 60 * 1000) {
  // Run once immediately, then on an interval
  setTimeout(sweepExpiredJobs, 5000); 
  setInterval(sweepExpiredJobs, intervalMs);
}

module.exports = { sweepExpiredJobs, startJobSweeper };
