import { Connection, ResultSetHeader } from "mysql2/promise"
import { ContactBeforeCreate, ImportRecord, User } from "../types"
import { generateDisplayId } from "./util"
import "dotenv/config"

export async function getImportRecord(
	connection: Connection,
	id: string
): Promise<ImportRecord | null> {
	const sql = `SELECT * FROM imports WHERE displayId = ?`
	const values = [id]
	const [imports] = (await connection.execute(sql, values)) as [
		ImportRecord[],
		unknown
	]
	return imports[0] ?? null
}

export async function contactPhoneExists(
	connection: Connection,
	user: User,
	phone: string
): Promise<boolean> {
	const sql = `SELECT id FROM contacts WHERE userId = ? AND phone = ?`
	const values = [user.id, phone]
	const [rows] = (await connection.execute(sql, values)) as [
		{ id: number }[],
		unknown
	]
	return rows.length > 0
}

export async function contactEmailExists(
	connection: Connection,
	user: User,
	email: string
): Promise<boolean> {
	const sql = `SELECT id FROM contacts WHERE userId = ? AND email = ?`
	const values = [user.id, email]
	const [rows] = (await connection.execute(sql, values)) as [
		{ id: number }[],
		unknown
	]
	return rows.length > 0
}

export async function getUser(
	connection: Connection,
	id: number
): Promise<User | null> {
	const sql = `SELECT id, displayId, email, company FROM users WHERE id = ?`
	const values = [id]
	const [users] = (await connection.execute(sql, values)) as [User[], unknown]
	return users[0] ?? null
}

async function insertWithUniqueValue(
	connection: Connection,
	sql: string,
	values: any[],
	maxRetries: number = 10,
	generator?: () => string
): Promise<{
	uniqueValue: string
	id: number
}> {
	let retries = 0
	while (retries < maxRetries) {
		const uniqueValue = generator?.() ?? generateDisplayId()
		try {
			const [result] = (await connection.execute(sql, [
				...values,
				uniqueValue,
			])) as [ResultSetHeader, unknown]

			return {
				uniqueValue,
				id: result.insertId,
			}
		} catch (error: any) {
			if (error.code !== "ER_DUP_ENTRY") {
				throw error
			}
		}
		retries++
	}
	throw new Error("Failed to generate unique value")
}

export async function createContact(
	connection: Connection,
	user: User,
	contact: ContactBeforeCreate
): Promise<number> {
	const sql = `
		INSERT INTO contacts (userId, firstName, lastName, email, phone, displayId)
		VALUES (?, ?, ?, ?, ?, ?)
	`

	const values = [
		user.id,
		contact.firstName,
		contact.lastName,
		contact.email,
		contact.phone,
	]

	const { id } = await insertWithUniqueValue(connection, sql, values)

	return id
}

export async function addContactToImports(
	connection: Connection,
	importRecord: ImportRecord,
	contactId: number
): Promise<void> {
	const sql = `
		INSERT INTO importContacts (importId, contactId)
		VALUES (?, ?)
	`
	const values = [importRecord.id, contactId]
	await connection.execute(sql, values)
}

export async function setImportHandled(
	connection: Connection,
	importRecord: ImportRecord
): Promise<void> {
	const sql = `
		UPDATE imports
		SET
			handled = 1,
			handledAt = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	const values = [importRecord.id]
	await connection.execute(sql, values)
}

export async function setImportExecutionTime(
	connection: Connection,
	importRecord: ImportRecord,
	executionTime: number
): Promise<void> {
	const sql = `
		UPDATE imports
		SET
			executionTime = ?
		WHERE id = ?
	`
	const values = [executionTime, importRecord.id]
	await connection.execute(sql, values)
}
