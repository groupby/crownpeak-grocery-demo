const express = require('express')
const app = express();
const port = 8080;
const fs = require('fs');
var favicon = require('serve-favicon');

require('dotenv').config();

const currentDemo = 'grocery-demo';

// app.use(favicon(__dirname + '/favicon.ico'));

const {Storage} = require('@google-cloud/storage');
var env = 'live';

const storage = new Storage('groupby-demos',process.env.GOOGLE_STORAGE);
const bucketName = 'demos_content';

async function get404() {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + '/404.html');

  return new Promise((resolve, reject) => {
    let feed = file.createReadStream();
    var buf = '';
    feed.on('data', async function(d) {
      buf += d;
    }).on('end', async function() {
      let formattedPage = buf.replace(/\/dev\//g,'\/').replace(/\/live\//g,'\/').replace(/\/Global Assets\//g,'\/global-assets\/').replace(/\/Global%20Assets\//g,'\/global-assets\/');
      let completedPg = formattedPage;
      try {
        completedPg = await addHeaderFooter(formattedPage);
      } catch(error) {
        console.log('error getting header/footer');
      }
      resolve(completedPg);
    })
  });
}

app.get('/assets/*', function(req, res) {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    env = 'dev';
  }

  const bucket = storage.bucket(bucketName);
  let urlPath = req.url.split('/');
  const file = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + req.url.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404');
    }
    else {
      let parts = req.url.split('.');
      let ext = '';
      if(parts.length > 1) {
        ext = parts[1].split('?')[0];
      }
      // css, js
      // json
      if(ext == 'css' || ext == 'js') {
        let feed = file.createReadStream();
        var buf = '';
        feed.on('data', function(d) {
          buf += d;
        }).on('end', function() {
          if(ext == 'css') {
            res.type('css');
            // console.log('css file');
          }
          if(ext == 'js') {
            res.type('js');
            // console.log('js file');
          }
          res.send(buf);
        })
      }
      else {
        if(ext == 'json') {
          let feed = file.createReadStream();
          var buf = '';
          feed.on('data', function(d) {
            buf += d;
          }).on('end', function() {
            res.json(buf);
          })
        }
        else {
          const publicUrl = file.publicUrl();
          res.redirect(publicUrl);
        }
      }
    }
  });

});

app.get('/dev/' + currentDemo + '/*', (req, res) => {
  res.redirect(req.url.replace('/dev',''));
});

app.get('/live/' + currentDemo + '/*', (req, res) => {
  res.redirect(req.url.replace('/live',''));
});

app.get('/recipes-index.json', (req, res) => {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    env = 'dev';
  }

  const bucket = storage.bucket(bucketName);
  let urlPath = req.url.split('/');
  const file = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + req.url.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404');
    }
    else {
      let feed = file.createReadStream();
      var buf = '';
      feed.on('data', function(d) {
        buf += d;
      }).on('end', function() {
        res.send(buf);
      })
    }
  });
});

app.get('/*', async (req, res) => {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    env = 'dev';
  }
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + '/homepage.html');

  file.exists(function(err,exists) {
    if(!exists) {
      res.json({"results": "not found", "error": err});
    }
    else {
      let feed = file.createReadStream();
      var buf = '';
      feed.on('data', async function(d) {
        buf += d;
      }).on('end', async function() {
        let regex = new RegExp('/' + currentDemo + '/','g');
        let formattedPage = buf.replace(/\/dev\//g,'\/').replace(/\/live\//g,'\/').replace(regex,'/');
        res.send(formattedPage);
      })
    }
  });
  // res.send('testing...');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});
