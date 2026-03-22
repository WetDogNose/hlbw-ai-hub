import { getIapUser } from "@/lib/iap-auth";
import { redirect } from "next/navigation";
import UsersClient from "./client";
import prisma from '@/lib/prisma';

async function getInitialUsersData() {
    const [users, total] = await Promise.all([
        prisma.user.findMany({
            skip: 0,
            take: 10,
            orderBy: [
                { isApproved: "asc" },
                { name: "asc" },
                { email: "asc" }
            ]
        }),
        prisma.user.count()
    ]);
    return { users, total };
}

export default async function UsersPage() {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
        redirect("/");
    }

    const initialUsersData = await getInitialUsersData();
    
    // We mock system settings as hlbw-ai-hub doesn't use it
    let setting = { isActive: true, autoApproveNewUsers: false };

    return <UsersClient initialUsersData={initialUsersData} currentUserEmail={user.email} initialSetting={setting} />;
}
