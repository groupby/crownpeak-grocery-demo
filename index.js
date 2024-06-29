const express = require('express')
const app = express();
const port = 8080;
const fs = require('fs');
var favicon = require('serve-favicon');
const axios = require('axios');
var bodyParser = require('body-parser');
var cors = require('cors');
var cookieParser = require('cookie-parser');
app.use(cookieParser());
const Readable = require('stream').Readable;

require('dotenv').config();

app.use(cors());
app.use(bodyParser.json());

const currentDemo = 'grocery-demo';

app.use(favicon(__dirname + '/favicon.png'));

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

app.post('/pdp-api*', async function(req, res) {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'demos',
      'skip-cache': 'true'
    }
  };
  let pdp = await axios.get('https://search.demos.groupbycloud.com/api/search/product?collection=groceryProd&productId=' + req.body.id, options);
  res.json(pdp.data);
});

app.post('/save-recipe-terms', async (req, res) => {
  if(req.body.recipeId && req.body.searchTerms) {
    if(req.body.searchTerms.length == 0) {
      // delete file:
    }
    else {
      // save file:
      let newFilePath = 'demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + '/recipe-terms/' + req.body.recipeId + '.json';
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(newFilePath);
      if(file) {
        const readableStream = new Readable();
        readableStream.push(JSON.stringify(req.body.searchTerms));
        readableStream.push(null);
        let gcFile = bucket.file(newFilePath);
        readableStream.pipe(gcFile.createWriteStream({
          resumable: false,
          validation: false,
          contentType: 'application/json'
        }))
        .on('error', (error) => {
          res.json({
            "error": "failed to save to bucket: " + error
          });
        })
        .on('finish', async () => {
          res.json({
            success: req.body.recipeId
          });
        });
      }
      else {
        res.json({
          "error": "Unable to create file"
        });
      }

    }
  }
  else {
    res.json({
      error: 'invalid payload'
    })
  }
});

app.post('/search-api*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'demos',
      'skip-cache': 'true',
      'Access-Control-Allow-Origin' : '*'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  let search = await axios.post('https://search.demos.groupbycloud.com/api/search', req.body, options);
  res.json(search.data);
});

app.get('/grocery-demo/grocery-demo/assets/*', function(req, res) {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    env = 'dev';
  }

  let filePath = req.url.replace('main','pantry');

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + filePath.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + filePath.split('?')[0]);
    }
    else {
      let parts = filePath.split('.');
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

app.get('/assets/*', function(req, res) {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    env = 'dev';
  }

  let filePath = req.url.replace('main','pantry');

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + filePath.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + filePath.split('?')[0]);
    }
    else {
      let parts = filePath.split('.');
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
      res.send('error 404 - ' + 'demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + filePath.split('?')[0]);
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
        buf = buf.replace('tile-img|[{image}]','tile-img|[{images.0.uri}]').replace('mini-cart-image|[{image}]','mini-cart-image|[{images.0.uri}]').replace('mini-cart-price|{price}','mini-cart-price|{priceInfo.price}').replace('product-card-price|{price,2}','product-card-price|{priceInfo.price,2}')
        let regex = new RegExp('/' + currentDemo + '/','g');
        var formattedPage = buf.replace(/\/dev\//g,'\/').replace(/\/live\//g,'\/').replace(regex,'/');

        if(req.url.indexOf('/recipe/') != -1) {
          let recUrlParts = req.url.split('/');
          if(recUrlParts.length > 2) {
            let recipeId = recUrlParts[recUrlParts.length - 2];
            const file2 = bucket.file('demos-5fg5Xq2wWTzhrKKu/' + env + '/' + currentDemo + '/recipe-terms/' + recipeId + '.json');
            file2.exists(function(err,exists2) {
              if(!exists2) {
                res.send(formattedPage);
              }
              else {
                let feed2 = file2.createReadStream();
                var buf2 = '';
                feed2.on('data', async function(d) {
                  buf2 += d;
                }).on('end', async function() {
                  formattedPage = formattedPage.replace('<header>',('<div class="invisible recipe-search-terms">' + buf2 + '</div><header>'));
                  res.send(formattedPage);
                });
              }
            });
          }

        }
        else {
          res.send(formattedPage);
        }
      })
    }
  });
  // res.send('testing...');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)
});
