const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer();

const handler = (req, res) => {
  upload.single('file')(req, res, err => {
    res.json({ body: req.body, method: req.method, err: err ? err.message : null });
  });
};

app.post('/api', handler);

app.use((req, res, next) => {
  if (req.path === '/test') {
    req.method = 'POST';
    req.body = { url: 'fake.pdf', apiKey: req.query.apiKey };
    return handler(req, res);
  }
  next();
});

const server = app.listen(3344, () => {
  console.log('Server started');
});
