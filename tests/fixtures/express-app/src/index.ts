import express from "express";
import { userRouter } from "./routes/users.ts";

const app = express();
app.use("/users", userRouter);
app.listen(3000);
