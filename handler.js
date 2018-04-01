'use strict';

const im = require('imagemagick');
const fs = require('fs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const postProcessResource = (resource, fn) => {
  let ret = null;
  if (resource) {
    if (fn) {
      // perform passed function
      ret = fn(resource);
    }
    try {
      // delete file
      fs.unlinkSync(resource);
    } catch (err) {
      console.log('err:', err);
    }
  }
  return ret;
};

const resize = (req, callback) => {
  const body = JSON.parse(req.body);
  if (!body.base64Image) {
    const msg = 'Invalid resize request: no "base64Image" field supplied';
    console.log(msg);
    sendRes(401, msg, callback);
  }
  // If neither height nor width was provided, turn this into a thumbnailing request
  if (!body.height && !body.width) {
    body.width = 100;
  }
  const resizedFile = `/tmp/resized.${(body.outputExtension || 'png')}`;
  const buffer = new Buffer(body.base64Image, 'base64');
  const options = {
    srcData: buffer,
    dstPath: resizedFile,
    width: body.width,
    height: body.height ? body.height : null
  }
  try {
    im.resize(options, (err) => {
      if (err) {
        throw err;
      } else {
        console.log('Resize operation completed successfully');
        let fileBuffer = postProcessResource(outputFile, (file) => new Buffer(fs.readFileSync(file)));
        putfile(fileBuffer, callback);
      }
    });
  } catch (err) {
    console.log('Resize operation failed:', err);
    sendRes(401, err, callback);
  }
};

const convert = (req, callback) => {
  const body = JSON.parse(req.body);
  const customArgs = body.customArgs.split(',') || [];
  let outputExtension = body.outputExtension ? body.outputExtension : 'png';
  let inputFile = null;
  let outputFile = null;
  if (body.base64Image) {
    inputFile = `/tmp/inputFile.${(body.inputExtension || 'png')}`;
    const buffer = new Buffer(body.base64Image, 'base64');
    fs.writeFileSync(inputFile, buffer);
    customArgs.unshift(inputFile);
  }

  outputFile = `/tmp/outputFile.${outputExtension}`;
  customArgs.push(outputFile);
  console.log('customArgs:', customArgs);
  im.convert(customArgs, (err, output) => {
    if (err) {
      console.log('Convert operation failed:', err);
      sendRes(401, err, callback);
    } else {
      console.log('Convert operation completed successfully');
      if (outputFile) {
        let fileBuffer = postProcessResource(outputFile, (file) => new Buffer(fs.readFileSync(file)));
        putfile(fileBuffer, callback);
      } else {
        sendRes(401, output, callback);
      }
    }
  });
};

function getPage(req, callback){
  fs.readFile('./form.html', 'utf8', (err, data) => {
    if (err) throw err;
    sendRes(200, data, callback);
  });
}

function sendRes(status, body, callback) {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html"
    },
    body: body
  };
  callback(null, response);
}

const putfile = (buffer, callback) =>{
  let params = {
    Bucket: 'serverlessappdemo',
    Key: 'images/' + Date.now().toString() + '.png',
    Body: buffer
  };

  s3.putObject(params, (err, data) => {
    if (err) {
      console.log('se err:',err);
    }
    sendRes(200, '<img src="data:image/png;base64,' + buffer.toString('base64') + '"//>', callback);
  });
}


exports.handler = (event, context, callback) => {
  const req = event;
  const operation = req.queryStringParameters ? req.queryStringParameters.operation : null;
  switch (event.httpMethod) {
    case 'GET':
      getPage(req, callback);
      break;
    case 'POST':
      delete req.operation;
      try {
        JSON.parse(req.body);
      } catch(e){
        let bodyData = {
          "customArgs": decodeURIComponent(req.body.split('&')[1].split('=')[1]),
          "width": decodeURIComponent(req.body.split('&')[2].split('=')[1]),
          "heigth": decodeURIComponent(req.body.split('&')[3].split('=')[1]),
          "base64Image": decodeURIComponent(req.body.split('&')[5].split('=')[1])
        }
        req.body = JSON.stringify(bodyData);
      }
      switch (operation) {
        case 'ping':
          sendRes(200, 'pong', callback);
          break;
        case 'thumbnail':  // Synonym for resize
        case 'resize':
          resize(req, callback);
          break;
        case 'convert':
          convert(req, callback);
          break;
        default:
          sendRes(401, '`Unrecognized operation "${operation}"`', callback)
      }
      break;
  }
};
