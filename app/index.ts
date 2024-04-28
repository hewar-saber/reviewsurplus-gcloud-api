import "dotenv/config"
import express from "express"
import { middleware } from "./middleware"
import { POST as importPOST } from "./imports/route"

const app = express()

app.use(express.json())

app.use(middleware)

app.get("/", (req, res) => {
	res.send("Hello World")
})

app.get("/public/test", (req, res) => {
	res.send(process.env.NODE_ENV)
})

app.post("/imports/:id", importPOST)

const port = process.env.PORT || 3000

app.listen(port, () => {
	console.log(`Server is running on port ${port}`)
})
