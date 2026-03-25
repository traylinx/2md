const fs = require('fs');
const path = require('path');

class LocalStorageAdapter {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  async writeFile(key, streamOrBuffer) {
    const fullPath = path.join(this.baseDir, key);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (Buffer.isBuffer(streamOrBuffer) || typeof streamOrBuffer === 'string') {
      fs.writeFileSync(fullPath, streamOrBuffer);
    } else {
      // It's a readable stream
      const writeStream = fs.createWriteStream(fullPath);
      streamOrBuffer.pipe(writeStream);
      return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }
  }

  async fileExists(key) {
    return fs.existsSync(path.join(this.baseDir, key));
  }

  async getReadStream(key) {
    if (!(await this.fileExists(key))) return null;
    return fs.createReadStream(path.join(this.baseDir, key));
  }

  async getDownloadUrl(key, originalName) {
    // Local storage doesn't use presigned URLs; the server will stream it directly
    return null; 
  }

  async deleteFile(key) {
    const fullPath = path.join(this.baseDir, key);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
}

module.exports = LocalStorageAdapter;
