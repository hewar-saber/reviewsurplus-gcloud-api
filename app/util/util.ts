import "dotenv/config"
import validator from "validator"
import { Contact, EmailOptions, ParsedCSVResult, Queue } from "../types"
import { parse } from "csv-parse/sync"
import util from "util"
import dns from "dns"
import nodemailer from "nodemailer"
import { getCloudTaskAdmin, log } from "./googleCloud"
import { Component } from "../editor/components"
import { randomInt } from "crypto"

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

export const API_ENDPOINTS = {
	BUSINESS_PROFILE_OAUTH: `${process.env.API_URL}/api/auth/google/business`,
	SIGNUP: `${process.env.API_URL}/api/auth/signup`,
	LOGIN: `${process.env.API_URL}/api/auth/login`,
	SESSION: `${process.env.API_URL}/api/auth/session`,
	ADD_PHONE_NUMBER: `${process.env.API_URL}/api/user/settings`,
	VERIFY_PHONE_NUMBER: `${process.env.API_URL}/api/user/settings/phone`,
	GOOGLE_ACCOUNT: `${process.env.API_URL}/api/user/settings/google`,
	CHANGE_PASSWORD: `${process.env.API_URL}/api/user/settings/password/change`,
	CHANGE_REVIEW_LINK: `${process.env.API_URL}/api/user/settings/review-link`,
	CONTACTS: `${process.env.API_URL}/api/contacts`,
	EMAIL_TEMPLATES: `${process.env.API_URL}/api/templates/emails`,
	EMAIL_PREVIEW: `${process.env.API_URL}/api/templates/emails/preview`,
	SMS_TEMPLATES: `${process.env.API_URL}/api/templates/sms`,
	SMS_PREVIEW: `${process.env.API_URL}/api/templates/sms/preview`,
	AVAILABLE_FROM_EMAILS: `${process.env.API_URL}/api/fromemails/available`,
	FROM_EMAILS: `${process.env.API_URL}/api/fromemails`,
	TRACKING: `${process.env.API_URL}/api/tracking`,
	DOMAINS: `${process.env.API_URL}/api/domains`,
	REVIEW_URL: `${process.env.API_URL}/api/reviews`,
	LOGOUT: `${process.env.API_URL}/api/auth/logout`,
	EMAIL_VERIFICATION: `${process.env.API_URL}/api/user/settings/email/verify`,
	SMS: `${process.env.API_URL}/api/sms`,
	EMAILS: `${process.env.API_URL}/api/emails`,
	IMPORTS: `${process.env.API_URL}/api/imports`,
	BRANDING: `${process.env.API_URL}/api/branding`,
}

const evaluateExpression = (
	contact: Contact,
	expressionParts: string[],
	redirectId?: string
) => {
	for (let part of expressionParts) {
		part = part.trim()

		//Special case for review link
		if (part.startsWith("contact.review")) {
			return ` ${process.env.URL_SHORTNER_URL}/${redirectId}`
		}

		if (part.startsWith("contact.")) {
			const propertyName = part.split(".")[1]
			if (propertyName in contact) {
				const value = contact[propertyName as keyof Contact] ?? ""
				if (value) {
					return value
				}
			}
		} else if (part.startsWith("'") || part.startsWith('"')) {
			return part.slice(1, -1)
		} else if (Number(part)) {
			return part
		}
	}
	return ""
}

export function replaceVariables(
	template: string,
	contact: Contact,
	redirectId?: string
) {
	const replacerPattern = /\${{([^}]+)}}/g

	const replacer = (match: string, expression: string) => {
		const expressionParts = expression.trim().split("||")
		return evaluateExpression(
			contact,
			expressionParts,
			redirectId
		) as string
	}
	return template.replace(replacerPattern, replacer).trim()
}

export function messageContainsReviewLink(message: string) {
	return message.includes("${{contact.review}}")
}

export function emailContainsReviewLink(components: {
	[key: string]: Component
}) {
	const componentsArray = Object.values(components)

	return componentsArray.some(({ values }) => {
		return Object.values(values).some((value) =>
			`${value}`.includes("${{contact.review}}")
		)
	})
}

export const queueCredentials = {
	[Queue.Email]: {
		projectId: getCloudTaskAdmin().project_id,
		location: process.env.GOOGLE_CLOUD_TASK_EMAIL_LOCATION,
	},
	[Queue.Sms]: {
		projectId: getCloudTaskAdmin().project_id,
		location: process.env.GOOGLE_CLOUD_TASK_SMS_LOCATION,
	},
	[Queue.Test]: {
		projectId: getCloudTaskAdmin().project_id,
		location: "us-central1",
	},
}

/**
 * @param {T[]} array - The array to get a random element from.
 * @returns {T} - A random element from the array.
 * @throws {Error} - Throws an error if the array is empty.
 * **/
export function getRandomElement<T>(array: T[]): T {
	if (array.length === 0) throw new Error("Array is empty")
	const index = randomInt(array.length)
	return array[index]
}
