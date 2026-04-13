const crypto = require('node:crypto');

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlString(str) {
  return base64Url(str);
}

const secret = 'PPCSecret';

const header = {
  alg: 'HS256',
  typ: 'JWT'
};

const now = Math.floor(Date.now() / 1000);

const payload = {
  userId: '64e9d3405c0f08e7e30b1b68',
  iat: now,
  exp: now + 3600
};

const encodedHeader = base64UrlString(JSON.stringify(header));
const encodedPayload = base64UrlString(JSON.stringify(payload));
const signingInput = `${encodedHeader}.${encodedPayload}`;

const encodedSignature = crypto
  .createHmac('sha256', secret)
  .update(signingInput)
  .digest('base64')
  .replace(/=+$/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const token = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

if (typeof pm !== 'undefined' && pm.environment) {
  pm.environment.set('jwt_token', token);
}

console.log(token);