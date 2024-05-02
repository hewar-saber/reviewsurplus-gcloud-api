import { Storage } from "@google-cloud/storage"
import "dotenv/config"
import { LogType, Queue, TaskParams } from "../types"
import { Entry, Logging } from "@google-cloud/logging"
import { CloudTasksClient } from "@google-cloud/tasks"
import { queueCredentials } from "./util"

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
	const credentials = JSON.parse(process.env.LOGGING_ADMIN_CREDENTIALS)

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

export function getCloudTaskAdmin() {
	return JSON.parse(process.env.TASK_ADMIN_CREDENTIALS)
}

export default async function createGoogleCloudTask({
	executeTime,
	data,
	url,
	method,
	queue,
	taskId,
	apiKey = process.env.GOOGLE_CLOUD_TASK_API_KEY,
}: TaskParams): Promise<string> {
	process.env.NODE_ENV === "development" && (queue = Queue.Test)

	const credentials = getCloudTaskAdmin()

	const client = new CloudTasksClient({
		credentials,
	})

	const { location, projectId } = queueCredentials[queue]

	const parent = client.queuePath(projectId, location, queue)

	const date = new Date()
	date.setUTCSeconds(date.getUTCSeconds() + 20)

	const task = {
		name: taskId && client.taskPath(projectId, location, queue, taskId),
		httpRequest: {
			httpMethod: method,
			url,
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: Buffer.from(JSON.stringify(data)).toString("base64"),
		},
		scheduleTime: {
			seconds:
				executeTime < new Date()
					? Math.floor(date.getTime() / 1000)
					: Math.floor(executeTime.getTime() / 1000),
		},
	} as any

	const [response] = await client.createTask(
		{ parent, task },
		{
			maxRetries: 1,
		}
	)

	return response.name!
}

export async function deleteGoogleCloudTask(queue: Queue, taskId: string) {
	process.env.NODE_ENV === "development" && (queue = Queue.Test)

	const credentials = getCloudTaskAdmin()
	const client = new CloudTasksClient({
		credentials,
	})

	const { location, projectId } = queueCredentials[queue]

	const taskName = client.taskPath(projectId, location, queue, taskId)

	try {
		await client.deleteTask({ name: taskName })
	} catch (error: any) {
		if (error.code !== 5) throw error
	}
}
