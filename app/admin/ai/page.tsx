import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import AiClient from "./client";

export default async function AiPage() {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
        redirect("/");
    }

    return <AiClient />;
}
