const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const axios = require("axios");
const express = require("express");
const app = express();
const PORT = 3000;
const nodemailer = require("nodemailer");
var token = "";

require("dotenv").config();
mongoose.connect("mongodb://mongo:27017/tokenDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
async function getToken() {
  const authString = Buffer.from(
    `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
  ).toString("base64");
  try {
    const response = await fetch("https://oauth.battle.net/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(data);
    token = data.access_token;
  } catch (error) {
    console.error("Error:", error);
  }
}
const transporter = nodemailer.createTransport({
  service: "gmail", // For Gmail, use 'gmail'
  auth: {
    user: process.env.EMAIL_USERNAME, // Your email
    pass: process.env.EMAIL_PASSWORD, // Your email password
  },
});

function sendEmail(subject, text) {
  const mailOptions = {
    from: process.env.EMAIL_USERNAME, // Sender address
    to: "fayeyoussouphadev@gmail.com", // List of recipients
    subject: subject,
    text: text,
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

app.post("/fetch-token", async (req, res) => {
  const apiUrl = "https://eu.api.blizzard.com/data/wow/token/index";
  try {
    const now = new Date();
    const isTokenEmpty = token.length == 0;
    const isLateHour = now.getHours() == 11 || now.getHours() == 23;
    const isLateMinute = now.getMinutes() >= 30;
    if (isTokenEmpty || (isLateMinute && isLateHour)) {
      console.log(
        "Condition met: Token is empty or the current time is 11:30-11:59 AM/PM"
      );
      await getToken();
    }
    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
      params: { namespace: "dynamic-eu", locale: "en_US" },
    });
    const newToken = new Token({ price: response.data.price });
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
        token.price >= newToken.price;
      });
    } else {
      isHighest = false;
    }
    if (isHighest) {
      sendEmail(
        `Highest price last 30 days  : ${now}`,
        `the highest price is now ${newToken.price} `
      );
    }
    res.send("Token price fetched and stored");
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
      minPrice: minPrice,
      maxPrice: maxPrice,
      meanPrice: meanPrice.toFixed(2),
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
      minPrice: minPrice,
      maxPrice: maxPrice,
      meanPrice: meanPrice.toFixed(2),
    });
  } catch (error) {
    res.status(500).send(error.toString());
    sendEmail(`Error fetching weekly tokens`, error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
