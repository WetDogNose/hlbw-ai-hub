import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import ConfigurationClient from "./client";

export default async function ConfigurationPage() {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
        redirect("/");
    }

    // Prepare obfuscated environment variables
    const config = {
        email: {
            host: process.env.SMTP_HOST || "Not Set",
            user: process.env.SMTP_USER 
                ? (process.env.SMTP_USER.includes("@") ? "***" + process.env.SMTP_USER.substring(process.env.SMTP_USER.indexOf("@")) : "***") 
                : "Not Set",
            admin: process.env.ADMIN_EMAIL || "Not Set",
        },
        database: {
            url: process.env.DATABASE_URL 
                ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@") 
                : "Not Set"
        },
        storage: {
            bucket: process.env.GCS_BUCKET_NAME || "Not Set"
        },
        ai: {
            geminiKey: process.env.GEMINI_API_KEY 
                ? "AIzaSy***" + process.env.GEMINI_API_KEY.slice(-4) 
                : "Not Set"
        },
        stripe: {
            publishableKey: process.env.STRIPE_PUBLISHABLE_KEY 
                ? process.env.STRIPE_PUBLISHABLE_KEY.substring(0, 7) + "***" 
                : "Not Set",
            secretKey: process.env.STRIPE_SECRET_KEY 
                ? "sk_***" + process.env.STRIPE_SECRET_KEY.slice(-4) 
                : "Not Set",
        },
        oauth: {
            google: !!process.env.GOOGLE_CLIENT_ID,
            github: !!process.env.GITHUB_CLIENT_ID,
            azure: !!process.env.AZURE_AD_CLIENT_ID,
            apple: !!process.env.APPLE_CLIENT_ID,
        }
    };

    return <ConfigurationClient initialConfig={config} />;
}
