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
			IMPORT_BUCKET_NAME: string
			SYSTEM_EMAIL: string
			SYSTEM_EMAIL_PASSWORD: string
			EMAIL_SMTP_HOST: string
			EMAIL_SMTP_PORT: string
			FRONTEND_URL: string
		}
	}
}
