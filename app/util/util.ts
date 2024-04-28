import "dotenv/config"
import validator from "validator"
import { EmailOptions, ParsedCSVResult } from "../types"
import { parse } from "csv-parse/sync"
import util from "util"
import dns from "dns"
import nodemailer from "nodemailer"
import { log } from "./googleCloud"

export function validateDisplayId(displayId: string): boolean {
	const parts = displayId.split("-")

	if (parts.length !== 2) return false

	const [prefix, suffix] = parts

	return validator.isNumeric(prefix) && validator.isAlphanumeric(suffix)
}

export function parseCSV(csvString: string): ParsedCSVResult {
	const records: Record<string, string | null>[] = parse(csvString, {
		bom: true,
		columns: true,
		skip_empty_lines: true,
	})

	if (records.length === 0) {
		throw new Error("No data found in CSV")
	}

	const headers: string[] = Object.keys(records[0])

	const rows: (string | null)[][] = records.map((record) =>
		headers.map((header) => record[header])
	)

	return { headers, rows }
}

export function validateFirstName(name: string) {
	const regex = /^[\p{L}'\s-]+$/u
	return regex.test(name)
}

export function inRange(value: number, min: number, max: number): boolean {
	return value >= min && value <= max
}

export function validateContactName(name: string): boolean {
	const CONTACT_NAME_MIN_LENGTH = 2
	const CONTACT_NAME_MAX_LENGTH = 255
	const validLength = inRange(
		name.length,
		CONTACT_NAME_MIN_LENGTH,
		CONTACT_NAME_MAX_LENGTH
	)
	if (!validLength) return false
	return validateFirstName(name)
}

export function validatePhoneNumber(phoneNumber: string): boolean {
	const hasCountryCode = /^\+\d+/.test(phoneNumber)

	const isValid = validator.isMobilePhone(phoneNumber, "any")

	return hasCountryCode && isValid
}

export async function validateEmail(email: string): Promise<boolean> {
	const resolveMx = util.promisify(dns.resolveMx)
	if (email?.constructor !== String) return false
	if (!validator.isEmail(email)) return false

	const domain = email.split("@")[1]

	try {
		const addresses = await resolveMx(domain)
		return addresses && addresses.length > 0
	} catch (error) {
		return false
	}
}

function generateNumericId(length: number) {
	const characters = "0123456789"
	const charactersLength = characters.length
	const randomValues = crypto.getRandomValues(new Uint32Array(length))

	return Array.from(randomValues)
		.map((value) => characters.charAt(value % charactersLength))
		.join("")
}

export function generateAlphaNumericId(length: number) {
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
	const charactersLength = characters.length
	const randomValues = crypto.getRandomValues(new Uint32Array(length))

	return Array.from(randomValues)
		.map((value) => characters.charAt(value % charactersLength))
		.join("")
}

export function generateDisplayId(): string {
	const numbers = generateNumericId(4)
	const alphaNumeric = generateAlphaNumericId(4)
	return `${numbers}-${alphaNumeric}`
}

/**
 * Send an HTML email.
 *
 * @param {EmailOptions} options - The email options.
 * @returns {Promise<boolean>} - Returns true if the email is sent successfully.
 */
export async function sendHTMLEmail(options: EmailOptions): Promise<boolean> {
	try {
		const transporter = nodemailer.createTransport({
			host: options.from.host,
			port: options.from.port,
			secure: options.from.port === 465,
			auth: {
				user: options.from.email,
				pass: options.from.password,
			},
		})

		await transporter.sendMail({
			from: `"${options.from.name}" <${options.from.email}>`,
			to: options.to,
			subject: options.subject,
			html: options.html,
			bcc: options.bcc,
			cc: options.cc,
			attachments: options.attachments,
			text: options.plaintext,
		})
		return true
	} catch (error) {
		return false
	}
}

export async function tryWithoutException(
	callback: () => unknown | Promise<unknown>
) {
	try {
		await callback()
	} catch (error: any) {
		await log(error)
	}
}
