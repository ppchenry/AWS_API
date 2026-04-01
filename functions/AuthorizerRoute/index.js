const jwt = require("jsonwebtoken");

exports.handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event, null, 2));

  const authHeader = event.authorizationToken;
  if (!authHeader) throw new Error("Unauthorized");

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  const decoded = jwt.verify(token, process.env.JWT_SECRET, {
    algorithms: ["HS256"],
  });

  const arnParts = event.methodArn.split("/");
  const apiArn = `${arnParts[0]}/*/*/*`;

  return {
    principalId: decoded.sub,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: apiArn,
        },
      ],
    },
    context: {
      userId: decoded.sub,
      email: decoded.email || "",
    },
  };
};


