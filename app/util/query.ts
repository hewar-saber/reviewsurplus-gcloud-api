import { Connection, ResultSetHeader } from "mysql2/promise"
import {
	Blast,
	BlastStatus,
	Contact,
	ContactBeforeCreate,
	BlastEmailTemplate,
	FromEmail,
	ImportRecord,
	BlastSMSTemplate,
	User,
	EmailQuota,
} from "../types"
import {
	API_ENDPOINTS,
	emailContainsReviewLink,
	generateAlphaNumericId,
	generateDisplayId,
	messageContainsReviewLink,
	replaceVariables,
} from "./util"
import "dotenv/config"
import { Component } from "../editor/components"
import { convertToHTML } from "./convertToHtml"
import dayjs from "dayjs"

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

export async function getImportRecordById(
	connection: Connection,
	id: number
): Promise<ImportRecord | null> {
	const sql = `SELECT * FROM imports WHERE id = ?`
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
	const sql = `SELECT id, displayId, email, company, maxSms, maxEmails FROM users WHERE id = ?`
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

export async function getBlast(
	connection: Connection,
	id: string
): Promise<Blast | null> {
	const sql = `SELECT * FROM blasts WHERE displayId = ?`
	const values = [id]
	const [blasts] = (await connection.execute(sql, values)) as [
		Blast[],
		unknown
	]

	return blasts[0] ?? null
}

export async function getBlastSMSTemplates(
	connection: Connection,
	blast: Blast
) {
	const sql = `
	SELECT * FROM
	blastSMSTemplates
	WHERE blastId = ?
	`
	const values = [blast.id]
	const [rows] = (await connection.execute(sql, values)) as [
		BlastSMSTemplate[],
		unknown
	]

	return rows
}

export async function getBlastEmailTemplates(
	connection: Connection,
	blast: Blast
) {
	const sql = `
	SELECT emailTemplates.* FROM
	emailTemplates
	JOIN blastEmailTemplates ON emailTemplates.id = blastEmailTemplates.emailTemplateId
	WHERE blastEmailTemplates.blastId = ?
	`
	const values = [blast.id]
	const [rows] = (await connection.execute(sql, values)) as [
		BlastEmailTemplate[],
		unknown
	]

	return rows
}

export async function getContactsInImport(
	connection: Connection,
	importRecord: ImportRecord
) {
	const sql = `
		SELECT contacts.*
		FROM contacts
		JOIN importContacts ON contacts.id = importContacts.contactId
		WHERE importContacts.importId = ?
	`
	const values = [importRecord.id]
	const [rows] = (await connection.execute(sql, values)) as [
		Contact[],
		unknown
	]

	return rows
}

export async function updateBlastStatus(
	connection: Connection,
	blast: Blast,
	status: BlastStatus,
	handled: boolean = true
) {
	const sql = `
		UPDATE blasts
		SET
			status = ?,
			handled = ?,
			handledAt = CURRENT_TIMESTAMP
		WHERE id = ?
	`
	const values = [status, handled, blast.id]
	await connection.execute(sql, values)
}

export async function updateBlastExecutionTime(
	connection: Connection,
	blast: Blast,
	start: number
) {
	const end = performance.now()
	const executionTimeInSec = Math.ceil((end - start) / 1000)

	const sql = `
		UPDATE blasts
		SET executionTime = ?
		WHERE id = ?
	`
	const values = [executionTimeInSec, blast.id]
	await connection.execute(sql, values)
}

export async function getBlastFromEmails(connection: Connection, blast: Blast) {
	const sql = `
		SELECT fromEmails.*
		FROM fromEmails
		JOIN blastEmails ON fromEmails.id = blastEmails.fromEmailId
		WHERE blastEmails.blastId = ?
	`
	const values = [blast.id]
	const [rows] = (await connection.execute(sql, values)) as [
		FromEmail[],
		unknown
	]

	return rows
}

export async function createNewRedirect(
	conneciton: Connection,
	contact: Contact,
	{
		smsId,
		emailId,
	}: {
		smsId?: number
		emailId?: number
	}
): Promise<string> {
	const sql = `
		INSERT INTO redirect(contactId, smsId, emailId, baseUrl, shortId)
		VALUES(?, ?, ?, ?, ?)
	`
	const baseUrl = process.env.REDIRECT_BASE_URL
	const values = [contact.id, smsId ?? null, emailId ?? null, baseUrl]

	const { uniqueValue } = await insertWithUniqueValue(
		conneciton,
		sql,
		values,
		undefined,
		() => generateAlphaNumericId(4)
	)

	return uniqueValue
}

async function createEmailWithoutBody(
	connection: Connection,
	toContact: Contact,
	fromEmail: FromEmail,
	subject: string,
	executeTime: Date,
	emailTemplate?: BlastEmailTemplate
): Promise<{
	displayId: string
	id: number
}> {
	const subjectLine = replaceVariables(subject, toContact)

	const sql = `INSERT INTO emails (toContactId, fromId, subjectLine, executeTime, templateId, fromUserId, displayId) VALUES (?, ?, ?, ?, ?, ?, ?)`

	const values = [
		toContact.id,
		fromEmail.id,
		subjectLine,
		executeTime,
		emailTemplate?.emailTemplateId ?? null,
		fromEmail.userId,
	]

	const { uniqueValue, id } = await insertWithUniqueValue(
		connection,
		sql,
		values
	)

	return {
		displayId: uniqueValue,
		id,
	}
}

async function addBodyToEmail(
	connection: Connection,
	emailId: number,
	emailBody: string
): Promise<void> {
	const sql = `UPDATE emails SET emailBody = ? WHERE id = ?`
	await connection.execute(sql, [emailBody, emailId])
}

export async function createEmail(
	connection: Connection,
	toContact: Contact,
	fromEmail: FromEmail,
	subject: string,
	components: { [key: string]: Component },
	executeTime: Date,
	emailTemplate?: BlastEmailTemplate
): Promise<{
	displayId: string
	id: number
}> {
	const { displayId, id } = await createEmailWithoutBody(
		connection,
		toContact,
		fromEmail,
		subject,
		executeTime,
		emailTemplate
	)

	const trackingUrl = `${API_ENDPOINTS.TRACKING}/${displayId}.png`

	const containsReviewLink = emailContainsReviewLink(components)

	const redirectId = containsReviewLink
		? await createNewRedirect(connection, toContact, {
				emailId: id,
		  })
		: null

	const emailBody = await convertToHTML(
		Object.values(components),
		trackingUrl,
		toContact,
		redirectId ?? undefined
	)
	await addBodyToEmail(connection, id, emailBody)

	return { displayId, id }
}

export async function createSMSWithoutContent(
	connection: Connection,
	contact: Contact,
	executeTime: Date,
	user: User,
	template?: BlastSMSTemplate
): Promise<{
	displayId: string
	id: number
}> {
	const sql = `INSERT INTO sms(toContactId, templateId, executeTime, fromUserId, displayId) VALUES(?, ?, ?, ?, ?)`

	const values = [
		contact.id,
		template?.smsTemplateId ?? null,
		executeTime,
		user.id,
	]
	const { uniqueValue, id } = await insertWithUniqueValue(
		connection,
		sql,
		values
	)

	return { displayId: uniqueValue, id }
}

export async function addContentToSMS(
	conneciton: Connection,
	smsId: number,
	content: string
) {
	const sql = `UPDATE sms SET content = ? WHERE id = ?`
	await conneciton.execute(sql, [content, smsId])
}

export async function createSMS(
	connection: Connection,
	contact: Contact,
	content: string,
	executeTime: Date,
	user: User,
	template?: BlastSMSTemplate
) {
	const { id, displayId } = await createSMSWithoutContent(
		connection,
		contact,
		executeTime,
		user,
		template
	)

	const containsReviewLink = messageContainsReviewLink(content)

	const redirectId = containsReviewLink
		? await createNewRedirect(connection, contact, {
				smsId: id,
		  })
		: null

	const contentWithVariables = replaceVariables(
		content,
		contact,
		redirectId ?? undefined
	)

	await addContentToSMS(connection, id, contentWithVariables)
	return {
		displayId,
		id,
	}
}

export async function emailCountAndLimitForDate(
	connection: Connection,
	fromEmail: FromEmail,
	executeTime: Date = new Date()
) {
	const sql = `
		SELECT 
			COUNT(*) as totalEmails, 
			emailproviders.dailyEmailLimit as emailLimit
		FROM fromEmails
		LEFT JOIN emails ON fromemails.id = emails.fromId AND (DATE(emails.executeTime) = ? OR DATE(emails.sentAt) = ?)
		JOIN emailproviders ON fromemails.providerId = emailproviders.id
		WHERE fromEmails.id = ?
		GROUP BY emails.fromId, emailproviders.dailyEmailLimit

	`
	const executeTimeFormatted = dayjs(executeTime).format("YYYY-MM-DD")
	const values = [executeTimeFormatted, executeTimeFormatted, fromEmail.id]

	const [rows] = (await connection.execute(sql, values)) as [
		EmailQuota[],
		unknown
	]

	const [row] = rows

	return {
		totalEmails: row?.totalEmails ?? 0,
		emailLimit: row?.emailLimit ?? 0,
	}
}

export async function getTotalSMSSendOrScheduledForMonth(
	connection: Connection,
	user: User,
	date: Date
): Promise<number> {
	const sql = `
		SELECT COUNT(*) as total
		FROM sms
		WHERE fromUserId = ?
		AND MONTH(executeTime) = MONTH(?)
		AND status <> 'Failed'
	`
	const values = [user.id, date]
	const [rows] = (await connection.execute(sql, values)) as [
		{ total: number }[],
		unknown
	]
	return rows[0].total
}
