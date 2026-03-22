import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import StatsClient from "./client";

export default async function StatsPage() {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
        redirect("/");
    }

    return <StatsClient />;
}
