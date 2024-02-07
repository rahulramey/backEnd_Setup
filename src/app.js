import express from "express"
import cookieParser from "cookie-parser"
import cors from "cors"

const app= express();

app.use(cors({
    credentials:true,
    origin: process.env.CORS_ORIGIN
}))

// routes import
import userRouter from "./routes/user.routes.js"

// routes decleration
app.use("/api/v1/users",userRouter)

//input== http://localhost:8000/api/v1/users/register
// output== {"message":"ok"}

app.use(express.json({limit:"16kb"}))
app.use(express.urlencoded({extended:true, limit:"16kb"}))
app.use(express.static("public"))
app.use(cookieParser())

export{app}