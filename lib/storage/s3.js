const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');

class S3StorageAdapter {
  constructor() {
    this.bucket = process.env.S3_BUCKET;
    this.client = new S3Client({
      region: process.env.S3_REGION || 'eu-west-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: !process.env.S3_ENDPOINT, // Use path-style for custom endpoints only
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async writeFile(key, streamOrBuffer) {
    let body = streamOrBuffer;
    
    // If it's a file path string, create a read stream
    if (typeof streamOrBuffer === 'string') {
        body = fs.createReadStream(streamOrBuffer);
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: key.endsWith('.zip') ? 'application/zip' : 'application/octet-stream'
    });
    
    await this.client.send(command);
  }

  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  async getReadStream(key) {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const response = await this.client.send(command);
      return response.Body;
    } catch (error) {
      if (error.name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async getDownloadUrl(key, originalName) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${originalName}"`
    });
    
    // URL expires in 1 hour
    return await getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async deleteFile(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    await this.client.send(command);
  }
}

module.exports = S3StorageAdapter;
