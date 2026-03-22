import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import MaintenanceClient from "./client";

export default async function MaintenancePage() {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
        redirect("/");
    }

    return <MaintenanceClient />;
}
