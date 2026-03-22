import prisma from '@/lib/prisma';
import { Storage } from '@google-cloud/storage';

export interface AdminNotifications {
    pendingUsers: number;
    systemIssues: number;
}

// In-memory cache for health checks
const healthStatusCache = {
    isHealthy: true,
    lastCheckedAt: 0,
};
const HEALTH_CACHE_TTL_MS = 60000; // 60 seconds

async function checkSystemHealth(): Promise<boolean> {
    const now = Date.now();
    if (now - healthStatusCache.lastCheckedAt < HEALTH_CACHE_TTL_MS) {
        return healthStatusCache.isHealthy;
    }

    try {
        let allHealthy = true;

        try {
            await prisma.$queryRaw`SELECT 1`;
        } catch {
            allHealthy = false;
        }


        if (allHealthy) {
            try {
                const storage = new Storage();
                const bucketName = process.env.GCS_BUCKET_NAME;
                if (bucketName) {
                    const [exists] = await storage.bucket(bucketName).exists();
                    if (!exists) allHealthy = false;
                }
            } catch {
                allHealthy = false;
            }
        }

        healthStatusCache.isHealthy = allHealthy;
        healthStatusCache.lastCheckedAt = now;
        return allHealthy;
    } catch (err) {
        healthStatusCache.isHealthy = false;
        healthStatusCache.lastCheckedAt = now;
        return false;
    }
}

export async function getAdminNotificationCounts(): Promise<AdminNotifications> {
    try {
        const [ pendingUsers ] = await Promise.all([
            prisma.user.count({ where: { isApproved: false } })
        ]);

        let systemIssues = 0;
        try {
            const isHealthy = await checkSystemHealth();
            if (!isHealthy) systemIssues = 1;
        } catch (e) {
            systemIssues = 1;
        }

        return {
            pendingUsers,
            systemIssues
        };
    } catch (error) {
        console.error("Failed to fetch admin notifications:", error);
        return {
            pendingUsers: 0,
            systemIssues: 0
        };
    }
}
