/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_ANON_KEY?: string;
	readonly VITE_WELCOME_EMAIL_WEBHOOK_URL?: string;
	readonly VITE_PCB_WORKSPACE_ACCESS_VIDEO_URL?: string;
	readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
