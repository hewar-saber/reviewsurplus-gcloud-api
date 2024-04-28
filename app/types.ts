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
	[key: string]: any
}

export type Contact = {
	id: number
	displayId: string
	email: string
	firstName: string
	lastName: string
	phone: string
	userId: number
	createdAt: Date
	updatedAt: Date
}

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
