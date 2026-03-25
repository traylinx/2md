const path = require('path');
const fs = require('fs');
const { JOBS_DIR } = require('../lib/config');
const storage = require('../lib/storage');

module.exports = function registerDownloadRoutes(app) {
  // ── DOWNLOAD SITE ZIP ──
  app.get('/api/download/:site', async (req, res) => {
    let siteName = req.params.site.replace(/[^a-z0-9.\-]/gi, '');
    const slugsParam = req.query.slugs;

    // Resolve the actual site name — the frontend may send dashes instead of dots
    // e.g. "2md-traylinx-com" should resolve to "2md.traylinx.com"
    function resolveSiteName(name) {
      const siteDir = path.join(JOBS_DIR, name);
      if (fs.existsSync(siteDir)) return name;
      // Try converting 2md-traylinx-com → 2md.traylinx.com
      const dotted = name.replace(/-/g, '.');
      if (dotted !== name && fs.existsSync(path.join(JOBS_DIR, dotted))) return dotted;
      return name; // fallback to original
    }

    // Check S3/storage archive first (no slugs = full site download)
    if (!slugsParam) {
      // Try both formats against S3
      const candidates = [siteName];
      const dotted = siteName.replace(/-/g, '.');
      if (dotted !== siteName) candidates.push(dotted);

      for (const candidate of candidates) {
        const isArchived = await storage.archiveExists(candidate);
        if (isArchived) {
          const downloadUrl = await storage.getDownloadUrl(candidate, `${candidate}.zip`);
          if (downloadUrl) {
            return res.redirect(downloadUrl);
          }
          const readStream = await storage.getArchiveStream(candidate);
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${candidate}.zip"`);
          return readStream.pipe(res);
        }
      }
    }

    // Resolve against local filesystem
    siteName = resolveSiteName(siteName);
    const siteDir = path.join(JOBS_DIR, siteName);

    if (!fs.existsSync(siteDir)) {
      return res.status(404).json({ error: 'Site directory not found' });
    }

    let scopedSlugs = null;
    if (slugsParam) {
      const slugs = slugsParam.split(',').map(s => s.trim()).filter(Boolean);

      if (slugs.length === 0) {
        return res.status(400).json({ error: 'No valid page slugs provided' });
      }

      scopedSlugs = slugs
        .map(s => s.replace(/[^a-z0-9\-_]/gi, ''))
        .filter(safe => safe && fs.existsSync(path.join(siteDir, 'pages', safe)));

      if (scopedSlugs.length === 0) {
        return res.status(404).json({ error: 'None of the requested pages were found' });
      }
    }

    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 6 } });

    let outputStream = res;
    let tmpZipPath = null;

    if (!scopedSlugs) {
      tmpZipPath = path.join(require('os').tmpdir(), `${siteName}_${Date.now()}.zip`);
      outputStream = require('fs').createWriteStream(tmpZipPath);
    } else {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${siteName}.zip"`);
    }

    archive.on('error', (err) => {
      if (scopedSlugs) {
        res.status(500).json({ error: err.message });
      } else {
        console.error('[API] Zip Error:', err);
      }
    });

    archive.pipe(outputStream);

    if (scopedSlugs) {
      const siteJsonPath = path.join(siteDir, 'site.json');
      if (fs.existsSync(siteJsonPath)) {
        archive.file(siteJsonPath, { name: path.join(siteName, 'site.json') });
      }

      for (const safe of scopedSlugs) {
        const pageDir = path.join(siteDir, 'pages', safe);
        archive.directory(pageDir, path.join(siteName, 'pages', safe));
      }
    } else {
      archive.directory(siteDir, siteName);
    }
    if (scopedSlugs) {
      archive.finalize();
    } else {
      await new Promise((resolve, reject) => {
        outputStream.on('close', resolve);
        archive.on('error', reject);
        archive.finalize();
      });

      try {
        await storage.writeJobArchive(siteName, tmpZipPath);
        console.log(`[API] Saved archive to storage: ${siteName}.zip`);
      } catch (err) {
        console.error(`[API] Failed to save archive to storage for ${siteName}:`, err);
      }

      try { require('fs').unlinkSync(tmpZipPath); } catch(e) {}

      const downloadUrl = await storage.getDownloadUrl(siteName, `${siteName}.zip`);
      if (downloadUrl) {
        return res.redirect(downloadUrl);
      } else {
        const readStream = await storage.getArchiveStream(siteName);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${siteName}.zip"`);
        return readStream.pipe(res);
      }
    }
  });

  // ── SCREENSHOT ──
  app.get('/api/screenshot/:hostname/:slug', (req, res) => {
    const { hostname, slug } = req.params;

    if (hostname.includes('..') || slug.includes('..') || hostname.includes('/') || slug.includes('/')) {
      return res.status(403).json({ error: 'Invalid hostname or slug' });
    }

    const imgPath = path.join(JOBS_DIR, hostname, 'pages', slug, 'input', 'screenshot.png');
    if (fs.existsSync(imgPath)) {
      res.sendFile(imgPath);
    } else {
      const fallbackPath = path.join(JOBS_DIR, hostname, 'pages', slug, 'output', 'screenshot.jpg');
      if (fs.existsSync(fallbackPath)) {
        res.sendFile(fallbackPath);
      } else {
        res.status(404).json({ error: 'Screenshot not found' });
      }
    }
  });
};
