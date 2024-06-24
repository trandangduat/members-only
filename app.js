const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const app = express();

app.get("/", (req, res) => {
    res.send("hi");
});

app.listen(3000, () => {
    console.log("listening on port 3000");
});