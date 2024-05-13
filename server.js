const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const axios = require("axios");
const express = require("express");
const app = express();
const PORT = 3000;
const nodemailer = require("nodemailer");
require("dotenv").config();
mongoose.connect("mongodb://mongo:27017/tokenDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

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
    const response = await axios.get(apiUrl, {
      headers: { Authorization: `Bearer ${process.env.BATTLE_NET_TOKEN}` },
      params: { namespace: "dynamic-eu", locale: "en_US" },
    });
    const newToken = new Token({ price: response.data.price });
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch all prices from the last 30 days up to the current time
    const historicalPrices = await Token.find({
      timestamp: { $gte: thirtyDaysAgo, $lt: now },
    }).sort({ price: -1 });
    await newToken.save();
    let isHighest = true;
    if (historicalPrices.length > 200) {
        historicalPrices.forEach(token => {
            token.price >= newToken.price;
        })
    } else {
        isHighest = false;
    }
    if (isHighest) {
      sendEmail(
        "Highest price since last 30 dats",
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
