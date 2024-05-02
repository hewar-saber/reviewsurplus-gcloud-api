export type Paralell = {
	index: number
	addChunk: (chunk: Promise<any>) => void
	awaitChunksIfNeeded: () => Promise<void>
	breakLoop: () => void
}

export default async function executeInChunks(
	length: number,
	chunkSize: number,
	handler: ({
		index,
		addChunk,
		awaitChunksIfNeeded,
		breakLoop,
	}: Paralell) => Promise<void>
): Promise<void> {
	const chunks: Promise<any>[] = []
	const errors: any[] = []

	const awaitChunksIfNeeded = async () => {
		if (chunks.length >= chunkSize) {
			const results = await Promise.allSettled(chunks)
			results.forEach((result) => {
				if (result.status === "rejected") {
					errors.push(result.reason)
				}
			})
			if (errors.length > 0) {
				throw new Error(
					`One or more chunks failed: ${errors.join(", ")}`
				)
			}
			chunks.length = 0
		}
	}

	const addChunk = (chunk: Promise<any>) => {
		chunks.push(chunk)
	}

	let shouldBreak: boolean = false

	const breakLoop = () => {
		shouldBreak = true
	}

	for (let i = 0; i < length; i++) {
		if (shouldBreak) {
			break
		}
		addChunk(
			handler({
				index: i,
				addChunk,
				awaitChunksIfNeeded,
				breakLoop,
			})
		)
		await awaitChunksIfNeeded()
	}

	if (chunks.length > 0) {
		const results = await Promise.allSettled(chunks)
		chunks.length = 0
		results.forEach((result) => {
			if (result.status === "rejected") {
				errors.push(result.reason)
			}
		})

		if (errors.length > 0) {
			throw new Error(`One or more chunks failed: ${errors.join(", ")}`)
		}
	}

	if (errors.length > 0) {
		throw new Error(`One or more chunks failed: ${errors.join(", ")}`)
	}
}
