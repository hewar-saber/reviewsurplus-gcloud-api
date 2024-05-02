export declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV: "development" | "production"
			DB_HOST: string
			DB_USER: string
			DB_PASSWORD: string
			DB_NAME: string
			AUTH_TOKEN: string
			STORAGE_ADMIN_CREDENTIALS: string
			LOGGING_ADMIN_CREDENTIALS: string
			TASK_ADMIN_CREDENTIALS: string
			IMPORT_BUCKET_NAME: string
			SYSTEM_EMAIL: string
			SYSTEM_EMAIL_PASSWORD: string
			EMAIL_SMTP_HOST: string
			EMAIL_SMTP_PORT: string
			FRONTEND_URL: string
			MAX_CONTACTS: string
			MAX_SMS_PER_DAY: string
			API_URL: string
			GOOGLE_CLOUD_TASK_API_KEY: string
			GOOGLE_CLOUD_TASK_EMAIL_LOCATION: string
			GOOGLE_CLOUD_TASK_SMS_LOCATION: string
			CHUNK_SIZE: string
			REDIRECT_BASE_URL: string
			URL_SHORTNER_URL: string
		}
	}
}
