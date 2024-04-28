import { Request, Response, NextFunction } from "express"
import "dotenv/config"

export function middleware(req: Request, res: Response, next: NextFunction) {
	console.log("Inside middleware")
	const url = req.url
	if (url.startsWith("/public")) {
		next()
		return
	}
	const authorization = req.headers.authorization
	if (!authorization) {
		console.log("No authorization header")
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	const prefix = "Bearer "
	if (!authorization.startsWith(prefix)) {
		console.log("Does not start with Bearer")
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	const token = authorization.slice(prefix.length)

	if (token !== process.env.AUTH_TOKEN) {
		console.log("Invalid token")
		console.log(token)
		console.log("\n\n\n\n\n\n\n")
		console.log(process.env.AUTH_TOKEN)
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	next()
}
