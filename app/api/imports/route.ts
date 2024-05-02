import "dotenv/config"
import { Request, Response } from "express"
import {
	parseCSV,
	sendHTMLEmail,
	tryWithoutException,
	validateContactName,
	validateDisplayId,
	validateEmail,
	validatePhoneNumber,
} from "../../util/util"
import { Connection } from "mysql2/promise"
import {
	addContactToImports,
	contactEmailExists,
	contactPhoneExists,
	createContact,
	getImportRecord,
	getUser,
	setImportExecutionTime,
	setImportHandled,
} from "../../util/query"
import connect from "../../config/db"
import { getBuffer, log, saveBuffer } from "../../util/googleCloud"
import { User } from "../../types"
import { successfulImport } from "../../util/emails"

export async function POST(req: Request, res: Response) {
	const id = req.params.id
	const start = performance.now()
	if (!id) {
		return res.status(404).json({ message: "Not Found" })
	}

	if (!validateDisplayId(id)) {
		return res.status(404).json({ message: "Not Found" })
	}

	let connection: Connection | undefined
	try {
		connection = await connect()
		const importRecord = await getImportRecord(connection, id)

		if (!importRecord) {
			return res.status(404).json({ message: "Not Found" })
		}

		if (importRecord.handled) {
			//* 200 OK so Google Cloud doesn't retry the request
			return res.status(200).json({ message: "Already handled" })
		}

		const userId = importRecord.userId

		const user = await getUser(connection, userId)

		if (!user) {
			//* The user might be deleted
			//* Returning OK so Google Cloud doesn't retry the request
			return res.status(200).json({ message: "User not found" })
		}

		if (importRecord.handled) {
			//* 200 OK so Google Cloud doesn't retry the request
			return res.status(200).json({ message: "Already handled" })
		}

		const directory = process.env.NODE_ENV

		const csvBuffer = await getBuffer(
			process.env.IMPORT_BUCKET_NAME,
			`csv/${directory}/${importRecord.displayId}.csv`
		)

		const csvString = csvBuffer.toString("utf-8")

		//* CSV has been partially validated
		//* The required headers are checked
		//* The number of the CSV rows is checked

		const errorFunctions = {
			email: emailErrors,
			phone: phoneErrors,
			firstName: nameErrors,
			lastName: nameErrors,
		}

		const { rows, headers } = parseCSV(csvString)
		const errors: Array<{
			row: string
			errors: Record<string, string>
		}> = []
		let successCount = 0

		await connection.beginTransaction()

		const handleRow = async (
			connection: Connection,
			row: (string | null)[]
		) => {
			const error: Array<[string, string | undefined]> = []

			for (const header of headers) {
				const headerName = header as keyof typeof errorFunctions
				const index = headers.indexOf(header)
				const errorFunction = errorFunctions[headerName]
				if (errorFunction) {
					const errorMessage = await errorFunction(
						row[index],
						connection,
						user
					)
					error.push([header, errorMessage])
				}
			}
			const errorFiltered = error.filter(
				([, errorMessage]) => errorMessage !== undefined
			) as Array<[string, string]>

			if (errorFiltered.length) {
				errors.push({
					row: row.join(", "),
					errors: Object.fromEntries(errorFiltered),
				})
				return
			}

			const id = await createContact(connection, user, {
				email: row[headers.indexOf("email")]!,
				phone: row[headers.indexOf("phone")]!,
				firstName: row[headers.indexOf("firstName")]!,
				lastName: row[headers.indexOf("lastName")]!,
			})

			await addContactToImports(connection, importRecord, id)
			successCount++
		}

		const chunkSize = 50
		const chunks = []

		for (const row of rows) {
			chunks.push(handleRow(connection!, row))
			if (chunks.length === chunkSize) {
				await Promise.all(chunks)
				chunks.length = 0
			}
		}

		if (chunks.length) {
			await Promise.all(chunks)
		}

		await setImportHandled(connection, importRecord)

		const summary = {
			success: successCount,
			failed: errors.length,
			total: rows.length,
			errors: errors,
		}

		await saveBuffer(
			process.env.IMPORT_BUCKET_NAME,
			Buffer.from(JSON.stringify(summary)),
			`summary/${directory}/${importRecord.displayId}.json`,
			"application/json"
		)

		const { html, subject } = successfulImport({
			successCount,
			failedCount: errors.length,
			name: user.company,
			url: `${process.env.FRONTEND_URL}/lists/${importRecord.displayId}`,
		})

		await sendHTMLEmail({
			from: {
				name: "Review Surplus",
				email: process.env.SYSTEM_EMAIL,
				password: process.env.SYSTEM_EMAIL_PASSWORD,
				host: process.env.EMAIL_SMTP_HOST,
				port: Number(process.env.EMAIL_SMTP_PORT),
			},
			to: user.email,
			subject,
			html,
		})

		const end = performance.now()

		await tryWithoutException(async () => {
			const timeInSec = Math.ceil((end - start) / 1000)
			await setImportExecutionTime(connection!, importRecord, timeInSec)
		})

		await connection.commit()

		return res.status(200).json({ errors, successCount })
	} catch (error: any) {
		connection?.rollback()
		await log(error)
		return res.status(500).json({ message: "Internal Server Error" })
	} finally {
		await connection?.end()
	}
}

export function nameErrors(name: any): string | undefined {
	if (typeof name !== "string") {
		return "Please enter a valid name"
	}
	if (!name.length) {
		return "Please enter a name"
	}
	if (!validateContactName(name)) {
		return "Please enter a valid name"
	}
}

export async function phoneErrors(
	phone: any,
	connection: Connection,
	user: User
): Promise<string | undefined> {
	if (typeof phone !== "string") {
		return "Please enter a valid phone number"
	}
	if (!phone.length) {
		return undefined
	}

	if (!validatePhoneNumber(phone)) {
		return "Please enter a valid phone number"
	}

	if (await contactPhoneExists(connection, user, phone)) {
		return "A contact with this phone number already exists"
	}
}

export async function emailErrors(
	email: any,
	connection: Connection,
	user: User
): Promise<string | undefined> {
	if (typeof email !== "string") {
		return "Please enter a valid email address"
	}
	if (!email.length) {
		return undefined
	}
	if (!(await validateEmail(email))) {
		return "Please enter a valid email address"
	}

	if (await contactEmailExists(connection, user, email)) {
		return "A contact with this email already exists"
	}
}
