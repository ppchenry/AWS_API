const https = require("https");

exports.handler = function (event, context, callback) {
  // Get Elastic IP addresses from environment variable
  const elasticIPs = process.env.ELASTIC_IPS ? process.env.ELASTIC_IPS.split(",") : [];

  if (elasticIPs.length === 0) {
    return callback(null, {
      statusCode: 400,
      body: JSON.stringify({ error: "No Elastic IP addresses provided in ELASTIC_IPS environment variable" }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Call external service to get outbound IP
  const req = https.get("https://api.ipify.org", (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const outboundIP = data.trim();
      console.log("Outbound IP address:", outboundIP);

      // Verify if outbound IP matches any Elastic IP
      const isEIPMatch = elasticIPs.includes(outboundIP);

      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          outboundIP: outboundIP,
          elasticIPs: elasticIPs,
          isEIPMatch: isEIPMatch,
          message: isEIPMatch ? "Outbound IP matches an Elastic IP" : "Outbound IP does not match any Elastic IP",
        }),
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    });
  });

  req.on("error", (error) => {
    console.error("Error fetching IP:", error);
    callback(null, {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: error.message }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
};