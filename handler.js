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

const convert = async (event, callback) => {
  const body = JSON.parse(event.body);
  const customArgs = body.customArgs.split(',') || [];
  let outputExtension = body.outputExtension ? body.outputExtension : 'png';
  let inputFile = null;
  let outputFile = null;
  let output = null;

  try {
    if (body.base64Image) {
      inputFile = '/tmp/inputFile.png';
      const buffer = new Buffer(body.base64Image, 'base64');
      fs.writeFileSync(inputFile, buffer);
      customArgs.unshift(inputFile);
    }
  
    outputFile = `/tmp/outputFile.${outputExtension}`;
    customArgs.push(outputFile);
    console.log('customArgs:', customArgs);
  
    // [input, customArgs, output]
    await imConvert(customArgs);
    // let fileBuffer = new Buffer(fs.readFileSync(outputFile));
    // fs.unlinkSync(outputFile);
    let fileBuffer = postProcessResource(outputFile, (file) => new Buffer(fs.readFileSync(file)));
    await putfile(fileBuffer);
    sendRes(200, '<img src="data:image/png;base64,' + fileBuffer.toString('base64') + '"//>', callback);
  } catch (e) {
    console.log(`Error:${e}`);
    sendRes(500, e, callback);
  }
};

const getPage = async (callback) => {
  fs.readFile('./form.html', 'utf8', (err, data) => {
    if (err) throw err;
    sendRes(200, data, callback);
  });
}

const imConvert = (params) => {
  return new Promise(function(res, rej){
    im.convert(params, (err) => {
      if (err) {
        console.log(`Error${err}`);
        rej(err);
      } else {
        res('operation completed successfully');
      }
    });
 });
}

const sendRes = (status, body, callback) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html"
    },
    body: body
  };
  callback(null, response);
}

const putfile = async (buffer) => {
  let params = {
    Bucket: 'serverlessappdemo',
    Key: 'images/' + Date.now().toString() + '.png',
    Body: buffer
  };
  return await s3.putObject(params);
}


exports.handler = (event, context, callback) => {
  console.log('event:',JSON.stringify(event));
  const operation = event.queryStringParameters ? event.queryStringParameters.operation : null;
  if (event.httpMethod == 'GET') {
    getPage(callback);
  } else {
    try {
      JSON.parse(event.body);
    } catch (e) {
      let bodyData = {
        "customArgs": decodeURIComponent(event.body.split('&')[1].split('=')[1]),
        "base64Image": decodeURIComponent(event.body.split('&')[3].split('=')[1])
      }
      event.body = JSON.stringify(bodyData);
    }
    switch (operation) {
      case 'ping':
        sendRes(200, 'pong', callback);
        break;
      case 'convert':
        convert(event, callback);
        break;
      default:
        sendRes(401, '`Unrecognized operation "${operation}"`', callback)
    }
  }
};
