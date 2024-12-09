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

app.use(favicon(__dirname + '/favicon.png'));

const {Storage} = require('@google-cloud/storage');
var env = process.env.ENV;

const storage = new Storage('groupby-demos',process.env.GOOGLE_STORAGE);
const bucketName = 'demos_content';

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

// app.post('/save-recipe-terms', async (req, res) => {
//   if(req.body.recipeId && req.body.searchTerms) {
//     const bucket = storage.bucket(bucketName);
//     let newFilePath = 'gb-pantry/' + env + '/recipe-terms/' + req.body.recipeId + '.json';
//     if(req.body.searchTerms.length == 0) {
//       // delete file:
//       await bucket.file(newFilePath).delete();
//       res.json({
//         success: 'deleted'
//       })
//     }
//     else {
//       // save file:
//       const file = bucket.file(newFilePath);
//       if(file) {
//         const readableStream = new Readable();
//         readableStream.push(JSON.stringify(req.body.searchTerms));
//         readableStream.push(null);
//         let gcFile = bucket.file(newFilePath);
//         readableStream.pipe(gcFile.createWriteStream({
//           resumable: false,
//           validation: false,
//           contentType: 'application/json'
//         }))
//         .on('error', (error) => {
//           res.json({
//             "error": "failed to save to bucket: " + error
//           });
//         })
//         .on('finish', async () => {
//           res.json({
//             success: req.body.recipeId
//           });
//         });
//       }
//       else {
//         res.json({
//           "error": "Unable to create file"
//         });
//       }
//
//     }
//   }
//   else {
//     res.json({
//       error: 'invalid payload'
//     })
//   }
// });

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

app.get('/assets/*', function(req, res) {
  let filePath = req.url;

  const bucket = storage.bucket(bucketName);
  let urlPath = filePath.split('/');
  const file = bucket.file('gb-pantry/' + env + filePath.split('?')[0]);

  file.exists(function(err,exists) {
    if(!exists) {
      res.send('error 404 - ' + filePath.split('?')[0]);
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
    const file = 'gb-pantry/' + env + '/past-purchases/' + req.body.user + '.json';

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
    const file = bucket.file('gb-pantry/' + env + '/past-purchases/' + req.body.user + '.json');

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

app.get('/*', async (req, res) => {
  const bucket = storage.bucket(bucketName);
  const file = bucket.file('gb-pantry/' + env + '/template.html');

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
        if(req.url.indexOf('/recipe/') != -1) {
          let recUrlParts = req.url.split('/');
          if(recUrlParts.length > 2) {
            let recipeId = recUrlParts[recUrlParts.length - 2];
            const file2 = bucket.file('gb-pantry/' + env + '/recipe-terms/' + recipeId + '.json');
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
