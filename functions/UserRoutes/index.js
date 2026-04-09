const { handleRequest } = require("./src/handler");

exports.handler = async (event, context) => {
  return handleRequest(event, context);
};

