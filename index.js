const express = require('express')
const app = express();
const port = 8080;
var cors = require('cors');
require('dotenv').config();

app.use(cors());

const {Storage} = require('@google-cloud/storage');
var env = process.env.ENV;

const storage = new Storage('groupby-demos',process.env.GOOGLE_STORAGE);
const bucketName = 'demos_content';

app.get('/*', function(req, res) {
  let filePath = req.url;

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('groupby-demo-images' + filePath.split('?')[0]);

  file.exists(async function(err,exists) {
    if(!exists) {
      res.status(404).send('file not found');
    }
    else {
      let parts = filePath.split('.');
      let ext = '';
      if(parts.length > 1) {
        ext = parts[1].split('?')[0].toLowerCase();
      }
      // css, js
      // json
      let imgExts = [
        'png',
        'jpg',
        'jpeg',
        'svg',
        'gif',
        'webp'
      ];
      if(imgExts.indexOf(ext) != -1) {
        let filePath = req.url.split('/');
        file.getMetadata().then(function(data) {
          res.writeHead(200, {
              "Content-Type": `image/${ext.replace('svg','svg+xml').replace('jpg','jpeg')}`,
              "Content-Disposition": "attachment; filename=" + filePath[filePath.length - 1],
              "Content-Length": data[0].size,
              "Content-Transfer-Encoding": "binary"
          });
          file.createReadStream({ encoding: null }).pipe(res);
        });
      }
      else {
        res.status(404).send('file not found');
      }
    }
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});
