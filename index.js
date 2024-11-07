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
const {Translate} = require('@google-cloud/translate').v2;
const translate = new Translate();
const multer = require('multer');
const upload = multer();

require('dotenv').config();

app.use(cors());
app.use(bodyParser.json());

const currentDemo = 'grocery-demo';

app.use(favicon(__dirname + '/favicon-orgill.png'));

const {Storage} = require('@google-cloud/storage');
var env = process.env.ENV;

const storage = new Storage('groupby-demos',process.env.GOOGLE_STORAGE);
const bucketName = 'demos_content';

var triggerOK = false;

app.use(function (req, res, next) {
  if(req.query.code) {
    var options = {
      method: 'POST',
      url: 'https://groupbycloud.us.auth0.com/oauth/token',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      data: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.AUTH0_CLIENT,
        client_secret: process.env.AUTH0_SECRET,
        code: req.query.code,
        redirect_uri: `https://${req.get('host')}/callback`
      })
    };

    axios.request(options).then(function (response) {
      console.log('verifying',response.data);
      let decodedat = JSON.parse(Buffer.from(response.data.access_token.split('.')[1], 'base64').toString());
      console.log('decoded', decodedat);
      res.cookie('appAuth', response.data.access_token, { maxAge: 1000*60*60*24*30, httpOnly: true });
      if(req.cookies.currentPg && req.cookies.currentPg != '') {
        let gotoPg = req.cookies.currentPg;
        res.cookie('currentPg','', { maxAge: 1, httpOnly: true });
        res.redirect(gotoPg);
      }
      else {
        res.redirect('/');
      }
    }).catch(function (error) {
      // console.error(error);
      res.send('error - unable to load page');
    });
  }
  else {
    if(req.url == '/not-authorized') {
      if(req.cookies.appAuth) {
        // fully logout:
        let currentAuth = req.cookies.appAuth;

        let decodedsid = JSON.parse(Buffer.from(req.cookies.appAuth.split('.')[1], 'base64').toString());
        let sid = decodedsid.sub.replace('auth0|','');
        // res.json({
        //   'finding-sid': decodedsid
        // });

        res.cookie('appAuth', '', { maxAge: -1, httpOnly: true });
        let url = `https://groupbycloud.us.auth0.com/oidc/logout?logout_hint=${sid}&post_logout_redirect_uri=https://${req.get('host')}/not-authorized`;
        res.redirect(url);
      }
      else {
        res.send(`<!doctype html>
          <html>
          <head>
            <style type="text/css">
            html,body {
              height: 100%;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              text-align: center;
            }
            div {
              margin: .5rem 0;
              font-size: 1.25rem;
            }
            img {
              height: 3rem;
              width: auto;
            }
            </style>
          </head>
          <body>
            <div><img src="https://www.groupbyinc.com/media-library/groupby-horizontal-dark.png" /></div>
            <div>You are not authorized to view this site.</div>
            <div>If you require access to this demo,</div>
            <div>you may <a href="mailto:presales@groupbyinc.com">contact PreSales</a> to request it.</div>
            <div>&nbsp;</div>
            <div><a href="/">Click here to try again</a></div>
          </body>
          </html>`
        );
      }
    }
    else {
      if(!req.cookies.appAuth) {
        res.cookie('currentPg',decodeURIComponent(req.url), { maxAge: 1000*60*5, httpOnly: true });
        res.redirect(`https://groupbycloud.us.auth0.com/authorize?response_type=code&client_id=${process.env.AUTH0_CLIENT}&redirect_uri=https://${req.get('host')}/callback&scope=openid profile email ${process.env.AUTH0_PERMS}&audience=https://presales-demos-api&state=test`);
      }
      else {
        try {
          let decoded = JSON.parse(Buffer.from(req.cookies.appAuth.split('.')[1], 'base64').toString());
          console.log('checking', process.env.AUTH0_PERMS);
          if(decoded.email && decoded.email == 'presales@gmail.com') {
            triggerOK = true;
          }
          if(decoded.email.indexOf('@groupbyinc.com') != -1 || decoded.permissions.indexOf(process.env.AUTH0_PERMS) != -1) {
            // login OK
            next();
          }
          else {
            // res.cookie('appAuth', '', { maxAge: -1, httpOnly: true });
            res.redirect('/not-authorized');
          }
        }
        catch (err) {
          // res.cookie('appAuth', '', { maxAge: -1, httpOnly: true });
          res.redirect('/not-authorized');
        }
      }
    }
  }
});

async function get404() {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('poc-orgill/' + process.env.ENV + '/404.html');

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

async function testGoogleTextToSpeech(lang,audioBuffer) {
    const speech = require('@google-cloud/speech');
    const client = new speech.SpeechClient( { credentials: JSON.parse(process.env.SPEECH_KEY) });

    const audio = {
    content: audioBuffer.toString('base64'),
    };
    const config = {
    languageCode: lang,
    };
    const request = {
    audio: audio,
    config: config,
    };

    const [response] = await client.recognize(request);
    const transcription = response.results
    .map(result => result.alternatives[0].transcript)
    .join('\n');
    return transcription;
}

app.post('/translate', async function(req, res) {
  let [translations] = await translate.translate(decodeURIComponent(req.body.text), 'en-US');
  translations = Array.isArray(translations) ? translations : [translations];
  res.json({
    results: translations
  });
});

app.post('/speech', upload.any(), async (req, res) => {
    console.log("Getting text transcription..");
    let lang = (req.query.lang || 'en-US');
    let transcription = await testGoogleTextToSpeech(lang,req.files[0].buffer);
    console.log("Text transcription: " + transcription);
    res.json({
      transcription: transcription,
      lang: lang
    });
});

app.post('/pdp-api*', async function(req, res) {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'orgill',
      'skip-cache': 'true'
    }
  };
  try {
    let pdp = await axios.get(`https://search.sandbox.groupbycloud.com/api/search/product?collection=${(req.body.collection || 'products')}&productId=` + req.body.id, options);
    res.json(pdp.data);
  }catch(e) {
    res.json({
      "error": e
    });
  }
});

app.post('/search-api*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'orgill',
      'skip-cache': 'true',
      'Access-Control-Allow-Origin' : '*'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  try {
    let search = await axios.post('https://search.sandbox.groupbycloud.com/api/search', req.body, options);
    res.json(search.data);
  }catch(e) {
    res.json({
      "error": e
    });
  }
});

app.post('/facet*', async (req, res) => {
  console.log('facet call');
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'orgill'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  let facets = await axios.post('https://search.sandbox.groupbycloud.com/api/search/facet', req.body, options);
  res.json(facets.data);
});

app.post('/recs*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'X-Groupby-Customer-Id': 'orgill'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  try {
    let recs = await axios.post('https://recsapi.sandbox.groupbycloud.com/api/recommendation', req.body, options);
    res.json(recs.data);
  } catch(e) {
    res.json({
      error: e
    });
  }
});

app.post('/autocomplete*', async (req, res) => {
  let options = {
    headers: {
      'Authorization': 'client-key ' + process.env.CLIENT_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json',
      'X-Groupby-Customer-Id': 'orgill'
    }
  };

  if(req.cookies && req.cookies['gbi_visitorId']) {
    req.body.visitorId = req.cookies['gbi_visitorId'];
  }

  let auto = await axios.get(`https://autocomplete.sandbox.groupbycloud.com/api/request?collection=${req.query.collection}&area=${req.query.area}&searchItems=${req.query.pageSize}&query=${req.query.q}`, options);
  res.json(auto.data);
});

app.get('/grocery-demo/grocery-demo/assets/*', function(req, res) {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    // env = 'dev';
  }

  let filePath = req.url;

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('poc-orgill/' + process.env.ENV + filePath.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'poc-orgill/' + process.env.ENV + filePath.split('?')[0]);
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
    const file = 'poc-orgill/' + process.env.ENV + '/past-purchases/' + req.body.user + '.json';

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
    const file = bucket.file('poc-orgill/' + process.env.ENV + '/past-purchases/' + req.body.user + '.json');

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
  const file = bucket.file('poc-orgill/' + process.env.ENV + filePath.split('?')[0]);

  file.exists(async function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'poc-orgill/' + process.env.ENV + filePath.split('?')[0]);
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
        res.redirect('/images/no-image.svg');
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
  const file = bucket.file('poc-orgill/' + process.env.ENV + filePath.split('?')[0]);

  file.exists(async function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'poc-orgill/' + process.env.ENV + filePath.split('?')[0]);
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
  const file = bucket.file('poc-orgill/' + process.env.ENV + req.url.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + 'poc-orgill/' + process.env.ENV + filePath.split('?')[0]);
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

app.get('/trigger', async (req, res) => {
  if(triggerOK) {
    let out = `<!doctype html>
    <html>
    <head>
      <title>Trigger Script - Orgill POC</title>
    </head>
    <body>
      <h2>Script Results</h2>
      <div class="results">
        <div>...</div>
      </div>
      <iframe style="display: none;"></iframe>
      <script src="/assets/trigger.js"></script>
    </body>
    </html>
    `;
    res.send(out);
  }
  else {
    res.send('not authorized');
  }
});

app.get('/*', async (req, res) => {
  if(req.get('host').indexOf('groupby.cloud') == -1) {
    // env = 'dev';
  }
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('poc-orgill/' + process.env.ENV + '/homepage.html');

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
            const file2 = bucket.file('poc-orgill/' + process.env.ENV + '/recipe-terms/' + recipeId + '.json');
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
          // insert category/mm:
          let megaOptions = {
            headers: {
              'Authorization': 'client-key ' + process.env.CLIENT_KEY,
              'Content-Type': 'application/json',
              'X-Groupby-Customer-Id': 'orgill',
              'skip-cache': 'true'
            }
          };
          try {
            let megaData = await axios.get(`https://cm.sandbox.groupbycloud.com/api/megamenus/demo-megamenu/categories`, megaOptions);

            let visualData = await axios.get(`https://cm.sandbox.groupbycloud.com/api/megamenus/demo-visualmenu/categories`, megaOptions);

            let addedCode = `<div class="megamenu-data invisible">${JSON.stringify(megaData.data)}</div><div class="visualmenu-data invisible">${JSON.stringify(visualData.data)}</div>`;

            formattedPage = formattedPage.replace('</body>',`${addedCode}</body>`);
          }catch(e) {
            // do nothing
          }

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
