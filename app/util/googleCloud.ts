import { Storage } from "@google-cloud/storage"
import "dotenv/config"
import { LogType } from "../types"
import { Entry, Logging } from "@google-cloud/logging"

function formatErrorForLogging(error: any) {
	if (error instanceof Error) {
		return {
			message: error.message,
			stack: error.stack,
		}
	} else if (typeof error === "object" && error !== null) {
		return JSON.stringify(error)
	} else {
		return String(error)
	}
}

export async function log(error: any, type: LogType = "error"): Promise<void> {
	if (process.env.NODE_ENV === "development") {
		console.error(error)
		return
	}
	const credentials = JSON.parse(process.env.STORAGE_ADMIN_CREDENTIALS)

	const logging = new Logging({
		credentials,
		projectId: credentials.project_id,
	})

	const log = logging.log("reviewsurplus")

	const metadata = {
		resource: { type: "global" },
	}
	const entry: Entry = log.entry(metadata, {
		message: formatErrorForLogging(error),
		type,
	})

	await log.write(entry)
}

export async function getBuffer(
	bucketName: string,
	source: string
): Promise<Buffer> {
	const credentials = JSON.parse(process.env.STORAGE_ADMIN_CREDENTIALS)
	const storage = new Storage({ credentials })
	const bucket = storage.bucket(bucketName)
	const file = bucket.file(source)

	return new Promise((resolve, reject) => {
		const stream = file.createReadStream()
		const chunks: Buffer[] = []

		stream.on("error", (err: any) => {
			reject(err)
		})

		stream.on("data", (chunk: Buffer) => {
			chunks.push(chunk)
		})

		stream.on("end", () => {
			resolve(Buffer.concat(chunks))
		})
	})
}

export async function saveBuffer(
	bucketName: string,
	buffer: Buffer,
	destination: string,
	contentType: string = "application/octet-stream"
): Promise<void> {
	const credentials = JSON.parse(process.env.STORAGE_ADMIN_CREDENTIALS)

	const storage = new Storage({ credentials })
	const bucket = storage.bucket(bucketName)
	const file = bucket.file(destination)

	return new Promise((resolve, reject) => {
		const stream = file.createWriteStream({
			metadata: {
				contentType,
			},
		})

		stream.on("error", (err: any) => {
			reject(err)
		})

		stream.on("finish", () => {
			resolve()
		})

		stream.end(buffer)
	})
}
