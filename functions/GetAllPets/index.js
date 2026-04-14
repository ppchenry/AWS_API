const { handleRequest } = require("./src/handler");

exports.handler = async (event, context) => handleRequest(event, context);
