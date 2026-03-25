const LocalStorageAdapter = require('./local');
const S3StorageAdapter = require('./s3');
const config = require('../config');

class StorageService {
  constructor() {
    this.provider = process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'local';
    
    if (this.provider === 's3') {
      if (!process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
        console.warn('⚠️ S3 credentials missing. Falling back to local storage.');
        this.provider = 'local';
      } else {
        this.adapter = new S3StorageAdapter();
      }
    }

    if (this.provider === 'local') {
      this.adapter = new LocalStorageAdapter(config.JOBS_DIR);
    }
  }

  // Save a stream or buffer to storage
  async writeJobArchive(jobId, filePath) {
    const key = `${jobId}.zip`;
    await this.adapter.writeFile(key, filePath);
  }

  // Check if a job archive exists
  async archiveExists(jobId) {
    const key = `${jobId}.zip`;
    return await this.adapter.fileExists(key);
  }

  // Get reading stream (used by local storage download)
  async getArchiveStream(jobId) {
    const key = `${jobId}.zip`;
    return await this.adapter.getReadStream(key);
  }

  // Generate a direct download URL (used by S3 to offload bandwidth)
  async getDownloadUrl(jobId, originalName) {
    const key = `${jobId}.zip`;
    return await this.adapter.getDownloadUrl(key, originalName);
  }

  // Delete an archive
  async deleteArchive(jobId) {
    const key = `${jobId}.zip`;
    await this.adapter.deleteFile(key);
  }
}

// Export a singleton instance
module.exports = new StorageService();
