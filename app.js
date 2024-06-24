const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
require("dotenv").config();

const mongoDB = process.env.DATABASE_URL;
mongoose.connect(mongoDB);
const db = mongoose.connection;
db.on("error", console.error.bind(console, "mongo connection error"));

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.session());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
    res.render("index");
});

app.listen(3000, () => {
    console.log("listening on port 3000");
});
