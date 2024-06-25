const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");

require("dotenv").config();

const mongoDB = process.env.DATABASE_URL;
mongoose.connect(mongoDB);
const db = mongoose.connection;
db.on("error", console.error.bind(console, "mongo connection error"));

const User = mongoose.model(
    "User",
    new Schema({
        username: { type: String, required: true },
        password: { type: String, required: true },
    })
);

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.session());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
    res.render("index");
});
app.get("/signup", (req, res) => {
    res.render("signup");
});
app.post("/signup", 
    body("username", "Username must have at lease one character.")
        .trim()
        .isLength({ min: 1 })
        .escape(),
    body("password", "Password must have at lease one character.")
        .trim()
        .isLength({ min: 1 })
        .escape(),
    body("confirm-password", "Passwords do not match.")
        .trim()
        .isLength({ min: 1 })
        .escape()
        .custom((value, {req}) => {
            return (value === req.body.password);
        }),

    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.render("signup", { errors: errors.array() });
        } else {
            bcrypt.hash(req.body.password, 10, async (err, hashedPassword) => {
                if (err) next(err);
                const user = new User({
                    username: req.body.username,
                    password: hashedPassword,
                });
                await user.save();
                res.redirect("/");
            });
        }
    })
);

app.listen(3000, () => {
    console.log("listening on port 3000");
});
