require("dotenv").config();
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
const { DateTime } = require("luxon");
const flash = require('connect-flash');
const multer = require("multer");
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed.'), false);
        }
    },
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
});
const cloudinary = require('cloudinary').v2;

const mongoDB = process.env.DATABASE_URL;
mongoose.connect(mongoDB).catch((err) => console.log(err));

const User = mongoose.model(
    "User",
    new Schema({
        username: { type: String, required: true },
        password: { type: String, required: true },
        is_member: { type: Boolean, default: false },
        is_admin: { type: Boolean, default: false },
    })
);
const Post = mongoose.model(
    "Post",
    new Schema({
        author: { type: Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        content: { type: String, required: true },
        imageURL: { type: String },
    })
);

const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.session());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(flash());
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    next();
});

passport.use(
    new LocalStrategy(
        {
            passReqToCallback : true
        },
        async (req, username, password, done) => {
            try {
                const user = await User.findOne({ username: username });
                const formData = {
                    username,
                    password,
                    usernameFailure: false,
                    passwordFailure: false,
                    usernameFailureMessage: "Username does not exist.",
                    passwordFailureMessage: "Incorrect password."
                };
                if (!user) {
                    formData.usernameFailure = true;
                    req.flash("form-data", formData);
                    return done(null, false);
                };
                const match = await bcrypt.compare(password, user.password);
                if (!match) {
                    formData.passwordFailure = true;
                    req.flash("form-data", formData);
                    return done(null, false);
                };
                return done(null, user);
            } catch(err) {
                return done(err);
            };
        }
    )
);
passport.serializeUser((user, done) => {
    done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch(err) {
        done(err);
    };
});
const handleMulterError = (err, req, res) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            req.flash('fileError', 'File is too large. Maximum size is 2MB.');
        } else {
            req.flash('fileError', 'Error uploading file.');
        }
    } else if (err.message === 'Only images are allowed.') {
        req.flash('fileError', err.message);
    }
    return res.redirect('/new-post');
};

app.get("/", asyncHandler(async (req, res) => {
    const posts = await Post.find().populate("author");
    const allPosts = Array.from(posts).reverse();
    allPosts.forEach((post) => { 
        post.formattedDate = DateTime.fromJSDate(post.timestamp).toLocaleString(DateTime.DATETIME_MED);
        post.url = `/post/${post._id}/`;
    });
    res.render("index", {
        posts: allPosts 
    });
}));
app.get("/signup", (req, res) => {
    res.render("signup", {
        usernameExisted: req.flash("usernameExisted"),
    });
});
app.post("/signup", 
    body("username", "Username must have at least one character.")
        .trim()
        .isLength({ min: 1 })
        .escape(),
    body("password", "Password must have at least one character.")
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
            const usernameMatch = Array.from(await User.find({ username: req.body.username }));
            if (usernameMatch.length > 0) {
                req.flash("usernameExisted", "Username already exists.");
                res.redirect("/signup");
                return;
            }
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
app.get("/login", (req, res) => {
    res.render("login", {
        flashErrors: req.flash('error'),
        formData: req.flash('form-data')[0],
    });
});
app.post("/login", 
    body("username", "Username must have at least one character.")
        .trim()
        .isLength({ min: 1 })
        .escape(),
    body("password", "Password must have at least one character.")
        .trim()
        .isLength({ min: 1 })
        .escape(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.render("login", { errors: errors.array() });
        } else {
            next();
        }
    },
    passport.authenticate("local", {
        successRedirect: "/",
        failureRedirect: "/login",
    })
);
app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect("/");
    });
});
app.get("/membership", asyncHandler(async (req, res) => {
    if (!req.user.is_member) req.user.is_member = true;
    await req.user.save();
    res.redirect("/");
}));
app.get("/new-post", (req, res) => {
    res.render("new-post", {
        fileErrors: req.flash('fileError'),
    });
});
app.post("/new-post", 
    (req, res, next) => {
        upload.single('postImage')(req, res, (err) => {
            if (err) {
                return handleMulterError(err, req, res);
            }
            next();
        });
    },
    asyncHandler(async (req, res) => {
        let uploadResult = { url: '' };
        if (typeof req.file != 'undefined') {
            try {
                uploadResult = await new Promise((resolve) => {
                    cloudinary.uploader.upload_stream((error, uploadResult) => {
                        return resolve(uploadResult);
                    }).end(req.file.buffer);
                });
            } catch (err) {
                req.flash('fileError', 'Error uploading to Cloudinary');
                return res.redirect('/new-post');
            }
        }
        const post = new Post({
            author: req.user._id,
            timestamp: Date.now(),
            content: req.body.content,
            imageURL: uploadResult.url,
        });
        await post.save();
        res.redirect("/");
    })
);
app.get("/post/:id/delete", asyncHandler(async (req, res) => {
    if (typeof req.user == 'undefined' || !req.user.is_admin) {
        res.send("You must be admin to do this action.");
        return;
    }
    const post = await Post.findById(req.params.id);
    await post.deleteOne();
    res.redirect("/");
}));

app.listen(3000, () => {
    console.log("listening on port 3000");
});
