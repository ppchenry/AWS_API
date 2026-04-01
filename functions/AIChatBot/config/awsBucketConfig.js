import  { TextractClient } from "@aws-sdk/client-textract";

const textractClient = new TextractClient({
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWSACCESSID,
    secretAccessKey: process.env.AWSSECRETKEY,
  },
});

export default textractClient;