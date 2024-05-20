const mongoose = require("mongoose");
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const nodemailer = require("nodemailer");

const app = express();
const PORT = 3000;
const VALUE_DIVISOR = 10000;

require("dotenv").config();
mongoose.connect("mongodb://mongo:27017/tokenDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

function sendEmail(subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_USERNAME,
    to: "fayeyoussouphadev@gmail.com",
    subject: subject,
    html: `
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
          }
          h1 {
            color: #333333;
            font-size: 24px;
            margin-bottom: 10px;
          }
          p {
            color: #666666;
            font-size: 16px;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <h1>${subject}</h1>
        ${text}
        <p>Thank you for using our service.</p>
      </body>
    </html>
  `,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

app.use(bodyParser.json());

const tokenSchema = new mongoose.Schema({
  price: Number,
  timestamp: { type: Date, default: Date.now },
});

const Token = mongoose.model("Token", tokenSchema);

let token = "";

async function getToken() {
  const authString = Buffer.from(
    `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
  ).toString("base64");
  try {
    const response = await axios.post("https://oauth.battle.net/token", null, {
      params: {
        grant_type: "client_credentials",
      },
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.data.access_token) {
      throw new Error("Access token not found in response");
    }

    return response.data.access_token;
  } catch (error) {
    console.error("Error fetching token:", error.message);
    throw error;
  }
}

app.post("/fetch-token", async (req, res) => {
  try {
    const now = new Date();
    const isTokenEmpty = token.length == 0;
    const isLateHour = now.getHours() == 11 || now.getHours() == 23;
    const isLateMinute = now.getMinutes() >= 30;
    if (isTokenEmpty || (isLateMinute && isLateHour)) {
      console.log(
        "Condition met: Token is empty or the current time is 11:30-11:59 AM/PM"
      );
      token = await getToken();
    }
    console.log(token);
    const apiUrl = "https://eu.api.blizzard.com/data/wow/token/index";
    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params: { namespace: "dynamic-eu", locale: "en_US" },
    });
    const newToken = new Token({ price: response.data.price });

    console.log(newToken);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch all prices from the last 30 days up to the current time
    const historicalPrices = await Token.find({
      timestamp: { $gte: thirtyDaysAgo, $lt: now },
    }).sort({ price: -1 });
    await newToken.save();
    let isHighest = true;
    if (historicalPrices.length > 200) {
      historicalPrices.forEach((token) => {
        if (token.price >= newToken.price) {
          isHighest = false;
        }
      });
    } else {
      isHighest = false;
    }
    if (isHighest) {
      sendEmail(
        `Highest price last 30 days  : ${now}`,
        `the highest price is now ${newToken.price.toFixed(2)} `
      );
    }
    res.send(newToken);
  } catch (error) {
    res.status(500).send(error.toString());
    sendEmail(`error one fetch token `, error.message);
  }
});

app.get("/tokens", async (req, res) => {
  try {
    const tokens = await Token.find();
    res.json(tokens);
  } catch (error) {
    sendEmail(`error one get token `, error.message);
  }
});

app.get("/tokens/monthly", async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthlyTokens = await Token.find({
      timestamp: { $gte: thirtyDaysAgo, $lt: now },
    });

    if (monthlyTokens.length === 0) {
      res.json({ message: "No token data available for the last 30 days." });
      return;
    }

    const prices = monthlyTokens.map((token) => token.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const meanPrice =
      prices.reduce((acc, price) => acc + price, 0) / prices.length;

    res.json({
      minPrice: (minPrice / VALUE_DIVISOR).toFixed(2),
      maxPrice: (maxPrice / VALUE_DIVISOR).toFixed(2),
      meanPrice: (meanPrice / VALUE_DIVISOR).toFixed(2),
    });
  } catch (error) {
    res.status(500).send(error.toString());
    sendEmail(`Error fetching monthly tokens`, error.message);
  }
});

app.get("/tokens/weekly", async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weeklyTokens = await Token.find({
      timestamp: { $gte: sevenDaysAgo, $lt: now },
    });

    if (weeklyTokens.length === 0) {
      res.json({ message: "No token data available for the last 7 days." });
      return;
    }

    const prices = weeklyTokens.map((token) => token.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const meanPrice =
      prices.reduce((acc, price) => acc + price, 0) / prices.length;

    res.json({
      minPrice: (minPrice / VALUE_DIVISOR).toFixed(2),
      maxPrice: (maxPrice / VALUE_DIVISOR).toFixed(2),
      meanPrice: (meanPrice / VALUE_DIVISOR).toFixed(2),
    });
  } catch (error) {
    res.status(500).send(error.toString());
    sendEmail(`Error fetching weekly tokens`, error.message);
  }
});

app.get("/tokens/daily", async (req, res) => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const dailyTokens = await Token.find({
      timestamp: { $gte: yesterday, $lt: now },
    });

    if (dailyTokens.length === 0) {
      res.json({ message: "No token data available for yesterday." });
      return;
    }

    const prices = dailyTokens.map((token) => token.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const meanPrice =
      prices.reduce((acc, price) => acc + price, 0) / prices.length;
    sendEmail(
      `Price report for ${now.getDate()}/${now.getMonth()}/${now.getFullYear()}`,
      `<html><body>
         <b>Minimum Price:</b> ${(minPrice / VALUE_DIVISOR).toFixed(2)}<br>
         <b>Maximum Price:</b> ${(maxPrice / VALUE_DIVISOR).toFixed(2)}<br>
         <b>Mean Price:</b> ${(meanPrice / VALUE_DIVISOR).toFixed(2)}
         </body></html>`
    );
    res.json({
      minPrice: (minPrice / VALUE_DIVISOR).toFixed(2),
      maxPrice: (maxPrice / VALUE_DIVISOR).toFixed(2),
      meanPrice: (meanPrice / VALUE_DIVISOR).toFixed(2),
    });
  } catch (error) {
    res.status(500).send(error.toString());
    sendEmail(`Error fetching daily tokens`, error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
