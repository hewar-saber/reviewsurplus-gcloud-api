import { Request, Response, NextFunction } from "express"
import "dotenv/config"

export function middleware(req: Request, res: Response, next: NextFunction) {
	const url = req.url
	if (url.startsWith("/public")) {
		next()
		return
	}
	const authorization = req.headers.authorization
	if (!authorization) {
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	const prefix = "Bearer "
	if (!authorization.startsWith(prefix)) {
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	const token = authorization.slice(prefix.length)

	if (token !== process.env.AUTH_TOKEN) {
		res.status(401).json({ message: "Unauthorized" })
		return
	}
	next()
}
