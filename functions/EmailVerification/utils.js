const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString("hex");
}

function issueAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      expiresIn: "15m",
    }
  );
}

module.exports = {
  hashToken,
  generateRefreshToken,
  issueAccessToken
};