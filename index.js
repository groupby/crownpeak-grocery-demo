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

app.use(favicon(__dirname + '/favicon.ico'));

const {Storage} = require('@google-cloud/storage');
var env = process.env.ENV;

const storage = new Storage('groupby-demos',process.env.GOOGLE_STORAGE);
const bucketName = 'demos_content';

async function get404() {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('ace-poc/' + process.env.ENV + '/404.html');

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
      'X-Groupby-Customer-Id': 'acehardware',
      'skip-cache': 'true'
    }
  };
  let pdp = await axios.get('https://search.acehardware.groupbycloud.com/api/search/product?collection=ACENETProduction&productId=' + req.body.id, options);
  res.json(pdp.data);
});

app.post('/search-api*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'acehardware',
      'skip-cache': 'true',
      'Access-Control-Allow-Origin' : '*'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  let search = await axios.post('https://search.acehardware.groupbycloud.com/api/search', req.body, options);
  res.json(search.data);
});

app.post('/recs*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'acehardware'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  let recs = await axios.post('https://recsapi.acehardware.groupbycloud.com/api/recommendation', req.body, options);
  res.json(recs.data);
});

app.post('/autocomplete*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json',
      'X-Groupby-Customer-Id': 'acehardware'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  let auto = await axios.get(`https://autocomplete.acehardware.groupbycloud.com/api/request?collection=${req.query.collection}&area=${req.query.area}&searchItems=${req.query.pageSize}&query=${req.query.q}`, options);
  res.json(auto.data);
});

app.get('/grocery-demo/grocery-demo/assets/*', function(req, res) {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    // env = 'dev';
  }

  let filePath = req.url;

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('ace-poc/' + process.env.ENV + filePath.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'ace-poc/' + process.env.ENV + filePath.split('?')[0]);
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

async function getGlbChunk(file, start, end) {
  return new Promise(async (resolve, reject) => {
    var buf = '';
    let feed = file.createReadStream({start: start, end: end});
    feed.on('data', function(d) {
      buf += d;
    }).on('end', function() {
      resolve(buf);
    })
  });
}

app.post('/save-pp', async function(req, res) {
  if(req.body.user && req.body.pp) {
    const bucket = storage.bucket(bucketName);
    const file = 'ace-poc/' + process.env.ENV + '/past-purchases/' + req.body.user + '.json';

    const readableStream = new Readable();
    readableStream.push(JSON.stringify(req.body.pp));
    readableStream.push(null);
    let gcFile = bucket.file(file);
    readableStream.pipe(gcFile.createWriteStream({
      resumable: false,
      validation: false,
      contentType: 'application/json'
    }))
    .on('error', (error) => {
      res.json({
        status: 'error1'
      });
    })
    .on('finish', async () => {
      res.json({
        status: 'success'
      });
    });

  }
  else {
    res.json({
      status: 'error2'
    });
  }
});

app.post('/get-pps', async function(req, res) {
  if(req.body.user) {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file('ace-poc/' + process.env.ENV + '/past-purchases/' + req.body.user + '.json');

    file.exists(async function(err,exists) {
      if(!exists) {
        res.json({
          status: 'error1',
          data: []
        });
      }
      else {
        let feed = file.createReadStream();
        var buf = '';
        feed.on('data', function(d) {
          buf += d;
        }).on('end', function() {
          try {
            let ppData = JSON.parse(buf);
            res.json({
              status: 'success',
              data: ppData
            });
          } catch(e) {
            res.json({
              status: 'error2',
              data: []
            });
          }
        })
      }
    });

  }
  else {
    res.json({
      status: 'error3',
      data: []
    });
  }
});

app.get('/images/*', function(req, res) {
  let filePath = req.url;

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('ace-poc/' + process.env.ENV + filePath.split('?')[0]);

  file.exists(async function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'ace-poc/' + process.env.ENV + filePath.split('?')[0]);
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
        res.redirect('https://storage.googleapis.com/groupby-demo-images/image-not-found.png');
      }
    }
  });
});

app.get('/assets/*', function(req, res) {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    // env = 'dev';
  }

  let filePath = req.url;

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('ace-poc/' + process.env.ENV + filePath.split('?')[0]);

  file.exists(async function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'ace-poc/' + process.env.ENV + filePath.split('?')[0]);
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
    // env = 'dev';
  }

  const bucket = storage.bucket(bucketName);
  let urlPath = req.url.split('/');
  const file = bucket.file('ace-poc/' + process.env.ENV + req.url.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'ace-poc/' + process.env.ENV + filePath.split('?')[0]);
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
    // env = 'dev';
  }
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('ace-poc/' + process.env.ENV + '/homepage.html');

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
            const file2 = bucket.file('ace-poc/' + process.env.ENV + '/recipe-terms/' + recipeId + '.json');
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
                  // insert category/mm:
                  let megaOptions = {
                    headers: {
                      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
                      'Content-Type': 'application/json',
                      'X-Groupby-Customer-Id': 'acehardware',
                      'skip-cache': 'true'
                    }
                  };

                  let megaData = await axios.get(`https://cm.acehardware.groupbycloud.com/api/megamenus/demo-megamenu/categories`, megaOptions);

                  let visualData = await axios.get(`https://cm.acehardware.groupbycloud.com/api/megamenus/demo-visualmenu/categories`, megaOptions);

                  let addedCode = `<div class="megamenu-data invisible">${JSON.stringify(megaData.data)}</div><div class="visualmenu-data invisible">${JSON.stringify(visualData.data)}</div>`;

                  formattedPage = formattedPage.replace('</body>',`${addedCode}</body>`);

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
