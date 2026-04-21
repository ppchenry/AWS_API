const { S3Client } = require("@aws-sdk/client-s3");

const env = require("./env");

let s3Client = null;

function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  if (!env.AWS_BUCKET_REGION || !env.AWSACCESSID || !env.AWSSECRETKEY) {
    throw new Error("S3 configuration is incomplete");
  }

  s3Client = new S3Client({
    region: env.AWS_BUCKET_REGION,
    credentials: {
      accessKeyId: env.AWSACCESSID,
      secretAccessKey: env.AWSSECRETKEY,
    },
  });

  return s3Client;
}

module.exports = { getS3Client };