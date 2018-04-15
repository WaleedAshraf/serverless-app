'use strict';

const im = require('imagemagick');
const fs = require('fs');
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

const convert = async (body) => {
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
    let fileBuffer = new Buffer(fs.readFileSync(outputFile));
    fs.unlinkSync(outputFile);
    await putfile(fileBuffer);
    return sendRes(200, '<img src="data:image/png;base64,' + fileBuffer.toString('base64') + '"//>');
  } catch (e) {
    console.log(`Error:${e}`);
    return sendRes(500, e);
  }
};

const getPage = () => {
  let data = fs.readFileSync('./form.html', 'utf8');
  return sendRes(200, data);
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

const sendRes = (status, body) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html"
    },
    body: body
  };
  console.log('returning res:',response);
  return response;
}

const putfile = async (buffer) => {
  let params = {
    Bucket: 'serverlessappdemo',
    Key: 'images/' + Date.now().toString() + '.png',
    Body: buffer
  };
  return await s3.putObject(params);
}


exports.handler = async (event) => {
  console.log('event:',JSON.stringify(event));
  let data = null;
  const operation = event.queryStringParameters ? event.queryStringParameters.operation : null;
  if (event.httpMethod == 'GET') {
    return getPage();
  } else {
    try {
      data = JSON.parse(event.body);
    } catch (e) {
      console.log('e is:',e);
      data = {
        "customArgs": decodeURIComponent(event.body.split('&')[1].split('=')[1]),
        "base64Image": decodeURIComponent(event.body.split('&')[3].split('=')[1])
      }
    }
    switch (operation) {
      case 'ping':
        return sendRes(200, 'pong');
        break;
      case 'convert':
        return await convert(data);
        break;
      default:
        return sendRes(401, '`Unrecognized operation "${operation}"`');
    }
  }
};
