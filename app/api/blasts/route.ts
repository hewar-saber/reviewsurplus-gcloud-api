import { Request, Response } from "express"
import {
	getRandomElement,
	tryWithoutException,
	validateDisplayId,
} from "../../util/util"
import createGoogleCloudTask, {
	deleteGoogleCloudTask,
	log,
} from "../../util/googleCloud"
import { Connection } from "mysql2/promise"
import connect from "../../config/db"
import {
	createEmail,
	createSMS,
	emailCountAndLimitForDate,
	getBlast,
	getBlastEmailTemplates,
	getBlastFromEmails,
	getBlastSMSTemplates,
	getContactsInImport,
	getImportRecordById,
	getTotalSMSSendOrScheduledForMonth,
	getUser,
	updateBlastExecutionTime,
	updateBlastStatus,
} from "../../util/query"
import {
	Blast,
	BlastStatus,
	Contact,
	BlastEmailTemplate,
	FollowUpMethod,
	FromEmail,
	Queue,
	BlastSMSTemplate,
	User,
	FromEmailWithQuota,
	TaskParams,
} from "../../types"
import executeInChunks, { Paralell } from "../../util/parallel"

const chunkSize = Number(process.env.CHUNK_SIZE)

export async function POST(req: Request, res: Response) {
	const start = performance.now()

	const id = req.params.id

	if (!id) {
		return res.status(404).json({ message: "Not Found" })
	}

	if (!validateDisplayId(id)) {
		return res.status(404).json({ message: "Not Found" })
	}

	let connection: Connection | undefined
	const createdTasks: TaskParams[] = []
	let blast: Blast | null = null
	try {
		connection = await connect()

		blast = await getBlast(connection, id)

		if (!blast) {
			return res.status(404).json({ message: "Not Found" })
		}

		if (blast.handled) {
			//*200 so Google Cloud Task doesn't retry
			return res.status(200).json({ message: "Blast already handled" })
		}

		const importRecord = await getImportRecordById(
			connection,
			blast.importId
		)

		if (!importRecord) {
			return res.status(404).json({ message: "Not Found" })
		}

		const user = await getUser(connection, blast.userId)

		if (!user) {
			//*This should never happen because of the database constraints
			return res.status(500).json({ message: "Internal Server Error" })
		}

		const contacts = await getContactsInImport(connection, importRecord)

		if (!contacts.length) {
			await updateBlastStatus(connection, blast, BlastStatus.Failed)
			return res.status(400).json({ message: "No contacts found" })
		}

		const maxContacts = Number(process.env.MAX_CONTACTS)

		if (contacts.length > maxContacts) {
			await updateBlastStatus(connection, blast, BlastStatus.Failed)
			return res.status(400).json({
				message: `Too many contacts. Maximum is ${maxContacts}`,
			})
		}

		const contactsWithEmail = contacts.filter(
			(contact) => contact.email.length > 0
		)
		const contactsWithOnlyPhone = contacts.filter(
			(contact) => contact.email.length === 0 && contact.phone.length > 0
		)

		const smsTemplates = await getBlastSMSTemplates(connection, blast)
		const emailTemplates = await getBlastEmailTemplates(connection, blast)

		if (!emailTemplates.length && !smsTemplates.length) {
			//*This should never happen but just in case
			throw new Error("No templates found")
		}

		const initialReachoutMethod =
			blast.followUpMethod === FollowUpMethod.Email
				? smsTemplates.length > 0
					? FollowUpMethod.SMS
					: FollowUpMethod.Email
				: emailTemplates.length > 0
				? FollowUpMethod.Email
				: FollowUpMethod.SMS

		const shouldFollowUp =
			blast!.followUpDelayDays !== null &&
			smsTemplates.length > 0 &&
			emailTemplates.length > 0

		const followUpMethod =
			initialReachoutMethod === FollowUpMethod.Email
				? FollowUpMethod.SMS
				: FollowUpMethod.Email

		await connection.beginTransaction()
		const maxSMSPerDay = Number(process.env.MAX_SMS_PER_DAY)
		const tasks: TaskParams[] = []
		const executeTimes: Date[] = []

		const fromEmailsPromise = getBlastFromEmails(connection, blast)

		if (contactsWithOnlyPhone.length > 0 && smsTemplates.length > 0) {
			const chunk = executeInChunks(
				29,
				chunkSize,
				async ({ index, addChunk }) => {
					addChunk(
						executeInChunks(
							maxSMSPerDay,
							chunkSize,
							async ({ breakLoop, addChunk }) => {
								const contact = contactsWithOnlyPhone.shift()!

								if (!contact) {
									breakLoop()
									return
								}

								const executeTime = new Date()
								executeTime.setUTCDate(
									executeTime.getUTCDate() + index
								)

								const randomizedDate =
									randomizeTime(executeTime)
								executeTimes.push(randomizedDate)

								const chunk = scheduleSMS(
									connection!,
									contact,
									getRandomElement(smsTemplates),
									randomizedDate,
									user,
									tasks
								)
								await chunk
							}
						)
					)
				}
			)
			await chunk
		}

		if (emailTemplates.length > 0 && contactsWithEmail.length > 0) {
			const chunk = executeInChunks(
				29,
				chunkSize,
				async ({ index, addChunk }: Paralell) => {
					const fromEmails = await fromEmailsPromise

					if (!fromEmails.length) {
						throw new Error("No from emails found")
					}

					const day = index

					const executeTime = new Date()
					executeTime.setUTCDate(executeTime.getUTCDate() + day)
					const randomizedDate = randomizeTime(executeTime)

					const availableEmails = await getAvailableEmailsForDate(
						connection!,
						fromEmails,
						executeTime
					)

					if (!availableEmails.length) {
						return
					}

					const totalAvailableSlots = availableEmails.reduce(
						(acc, email) => {
							const quotaLeft = Math.max(
								0,
								email.emailLimit - email.totalEmails
							)
							acc += quotaLeft
							return acc
						},
						0
					)
					const maxEmailsPerDay = Math.min(
						Math.ceil(Number(process.env.MAX_CONTACTS) / 29),
						totalAvailableSlots
					)

					if (maxEmailsPerDay < 1) {
						return
					}

					const chunk = executeInChunks(
						maxEmailsPerDay,
						chunkSize,
						async ({ breakLoop, addChunk }) => {
							if (!contactsWithEmail.length) {
								breakLoop()
								return
							}

							const contact = contactsWithEmail.shift()!

							const fromEmail = getRandomElement(availableEmails)

							fromEmail.totalEmails++
							const emailAtLimit =
								fromEmail.totalEmails >= fromEmail.emailLimit

							if (emailAtLimit) {
								availableEmails.splice(
									availableEmails.indexOf(fromEmail),
									1
								)
							}

							if (
								initialReachoutMethod ===
									FollowUpMethod.Email ||
								contact.phone.length === 0
							) {
								addChunk(
									scheduleEmail(
										connection!,
										fromEmail,
										contact,
										getRandomElement(emailTemplates),
										randomizeTime(executeTime),
										user,
										tasks
									)
								)
							}

							if (
								initialReachoutMethod === FollowUpMethod.SMS &&
								contact.phone.length > 0
							) {
								addChunk(
									scheduleSMS(
										connection!,
										contact,
										getRandomElement(smsTemplates),
										executeTime,
										user,
										tasks
									)
								)
								executeTimes.push(randomizedDate)
							}

							if (!shouldFollowUp || !contact.phone.length) {
								return
							}
							if (
								followUpMethod === FollowUpMethod.SMS &&
								contact.phone.length === 0
							) {
								return
							}

							const followUpExecuteTime = new Date(executeTime)

							followUpExecuteTime.setUTCDate(
								followUpExecuteTime.getUTCDate() +
									blast!.followUpDelayDays!
							)
							switch (followUpMethod) {
								case FollowUpMethod.Email:
									addChunk(
										scheduleEmail(
											connection!,
											fromEmail,
											contact,
											getRandomElement(emailTemplates),
											randomizeTime(followUpExecuteTime),
											user,
											tasks
										)
									)
									break
								case FollowUpMethod.SMS:
									addChunk(
										scheduleSMS(
											connection!,
											contact,
											getRandomElement(smsTemplates),
											randomizeTime(followUpExecuteTime),
											user,
											tasks
										)
									)
									break
							}
						}
					)
					await chunk
				}
			)

			await chunk
		}

		const smsDates =
			executeTimes.length > 0
				? [getLargestDate(executeTimes), getSmallestDate(executeTimes)]
				: []

		for (const date of smsDates) {
			const totalSMSSendOrScheduled =
				await getTotalSMSSendOrScheduledForMonth(connection, user, date)
			if (totalSMSSendOrScheduled > user.maxSms) {
				await connection.rollback()
				return res.status(400).json({ message: "SMS limit exceeded" })
			}
		}

		const isTest = blast.isTest
		if (!isTest) {
			await executeInChunks(
				tasks.length,
				chunkSize,
				async ({ index, addChunk }) => {
					const task = tasks[index]
					const handleTask = async () => {
						await createGoogleCloudTask(task)
						createdTasks.push(task)
					}

					addChunk(handleTask())
				}
			)
		}

		await updateBlastStatus(connection, blast, BlastStatus.InProgress, true)
		await connection.commit()

		await tryWithoutException(async () => {
			await updateBlastExecutionTime(connection!, blast!, start)
		})

		return res.json({ message: "Blast started successfuly" }).status(200)
	} catch (error) {
		await rollback(connection, blast, createdTasks, start)
		await log(error)
		return res.status(500).json({ message: "Internal Server Error" })
	} finally {
		await connection?.end()
	}
}

async function rollback(
	connection: Connection | undefined,
	blast: Blast | null,
	tasks: TaskParams[],
	start: number
) {
	await connection?.rollback()
	if (blast && connection) {
		await updateBlastStatus(connection, blast, BlastStatus.Failed)
		await updateBlastExecutionTime(connection, blast, start)
	}
	const isTest = blast?.isTest
	if (!isTest) {
		await deleteTasks(tasks)
	}
}

async function deleteTasks(tasks: TaskParams[]) {
	await executeInChunks(tasks.length, chunkSize, async ({ index }) => {
		const task = tasks[index]
		await tryWithoutException(async () => {
			await deleteGoogleCloudTask(task.queue, task.taskId!)
		})
	})
}

function randomizeTime(date: Date): Date {
	const randomizedDate = new Date(date)

	//* Set random delay between 60-300 minutes to ensure execution time is random and tasks don't start before transactions, considering a max Cloud Run function duration of 60 minutes.

	const minRandomMinutes = 60
	const maxRandomMinutes = 300
	const randomMinutes =
		Math.floor(Math.random() * (maxRandomMinutes - minRandomMinutes + 1)) +
		minRandomMinutes

	randomizedDate.setUTCMinutes(randomizedDate.getUTCMinutes() + randomMinutes)

	return randomizedDate
}

async function scheduleEmail(
	connection: Connection,
	fromEmail: FromEmail,
	contact: Contact,
	template: BlastEmailTemplate,
	executeTime: Date,
	user: User,
	tasks: TaskParams[]
) {
	const subjectLine = template.subjectLine
	const components = JSON.parse(template.components as string)

	const { displayId } = await createEmail(
		connection,
		contact,
		fromEmail,
		subjectLine,
		components,
		executeTime
	)

	const url = `${process.env.API_URL}/emails/${displayId}`
	tasks.push({
		executeTime,
		url,
		method: "POST",
		queue: Queue.Email,
		taskId: displayId,
		apiKey: process.env.API_URL,
		data: {},
	})
	return 1
}

async function scheduleSMS(
	connection: Connection,
	contact: Contact,
	template: BlastSMSTemplate,
	executeTime: Date,
	user: User,
	tasks: TaskParams[]
) {
	const { displayId } = await createSMS(
		connection,
		contact,
		template.content,
		executeTime,
		user,
		template
	)
	const url = `${process.env.API_URL}/sms/${displayId}`

	tasks.push({
		executeTime,
		url,
		method: "POST",
		queue: Queue.Sms,
		taskId: displayId,
		apiKey: process.env.API_URL,
		data: {},
	})
	return 1
}

async function getAvailableEmailsForDate(
	connection: Connection,
	fromEmails: FromEmail[],
	date: Date
) {
	const emailsWithQuota: FromEmailWithQuota[] = []
	for (const fromEmail of fromEmails) {
		const { totalEmails, emailLimit } = await emailCountAndLimitForDate(
			connection,
			fromEmail,
			date
		)

		emailsWithQuota.push({
			...fromEmail,
			totalEmails,
			emailLimit,
		})
	}

	return emailsWithQuota.filter(
		(fromEmail) => fromEmail.totalEmails < fromEmail.emailLimit
	)
}

function getLargestDate(datesArray: Date[]) {
	return datesArray.reduce((latest, current) => {
		return current > latest ? current : latest
	})
}

function getSmallestDate(datesArray: Date[]) {
	return datesArray.reduce((earliest, current) => {
		return current < earliest ? current : earliest
	})
}
