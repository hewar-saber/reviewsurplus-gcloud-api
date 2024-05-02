import { CSSProperties } from "react"

export type JSONComponent = {
	type: string
	settings: { [key: string]: string | number }
	styles: CSSProperties
	values: { [key: string]: string | number }
}

export type ImportRecord = {
	id: number
	displayId: string
	userId: number
	handled: boolean
	handledAt: Date | null
	createdAt: Date
	executionTime: number | null
}

export type ParsedCSVResult = {
	headers: string[]
	rows: (string | null)[][]
}

export type User = {
	id: number
	displayId: string
	email: string
	company: string
	maxEmails: number
	maxSms: number
	[key: string]: any
}

export type Contact = {
	id: number
	displayId: string
	email: string
	phone: string
	firstName: string
	lastName: string
	userId: number
	createdAt: Date
	updatedAt: Date
}

export type ContactResponse = Omit<Contact, "id" | "userId">

export type ContactBeforeCreate = Pick<
	Contact,
	"email" | "firstName" | "lastName" | "phone"
>

export type EmailOptions = {
	from: {
		email: string
		password: string
		name: string
		host: string
		port: number
	}
	to: string
	subject: string
	html: string
	plaintext?: string
	cc?: string
	bcc?: string
	attachments?: { filename: string; content: string | Buffer }[]
}

export type LogType = "info" | "warn" | "error"

export enum BlastStatus {
	Pending = "pending",
	InProgress = "inProgress",
	Completed = "completed",
	Failed = "failed",
}

export enum FollowUpMethod {
	Email = "email",
	SMS = "sms",
}

export const allowedFollowUpDelayDays = [1, 2, 3] as const

export type followUpDelayDays = (typeof allowedFollowUpDelayDays)[number]

export type Blast = {
	id: number
	displayId: string
	userId: number
	importId: number
	createdAt: Date
	handled: boolean
	handledAt: Date | null
	executionTime: number | null
	status: BlastStatus
	followUpMethod: FollowUpMethod
	followUpDelayDays: followUpDelayDays | null
}

export type FromEmail = {
	id: number
	displayId: string
	userId: number
	domainId: number
	email: string
	providerId: number
	name: string
}
export type EmailQuota = {
	totalEmails: number
	emailLimit: number
}

export type FromEmailWithQuota = FromEmail & EmailQuota

export type BlastSMSTemplate = {
	id: number
	blastId: number
	content: string
	smsTemplateId: number | null
}

export type BlastEmailTemplate = {
	id: number
	blastId: number
	emailTemplateId: number | null
	subjectLine: string
	components: JSONComponent[] | string
}

export enum Queue {
	Email = "email",
	Sms = "sms",
	Test = "test",
}

export type TaskParams = {
	executeTime: Date
	data: { [key: string]: any }
	url: string
	method: "POST" | "GET" | "HEAD" | "DELETE" | "PUT"
	queue: Queue
	taskId?: string
	apiKey: string
}
