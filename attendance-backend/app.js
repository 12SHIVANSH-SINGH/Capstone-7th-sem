const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://attendance-frontend-sage.vercel.app"], // ✅ Set the frontend origin explicitly
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true, // ✅ Allow credentials (cookies, headers)
  })
);

app.use(cookieParser());
app.use(express.json());

const locationRoute = require('./routes/locationRoute');
app.use("/api/v1", locationRoute);
app.set('trust proxy', true); // Add this in your main Express config

const notes = require('./routes/userRoute');
app.use("/api/v1", notes);

const codeRoute = require('./routes/codeRoute');
app.use("/api/v1", codeRoute);

const errorMiddleware = require('./middleware/error');
app.use(errorMiddleware);

module.exports = app;
