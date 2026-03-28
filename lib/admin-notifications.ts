import prisma from "@/lib/prisma";
import { Storage } from "@google-cloud/storage";

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

let isCheckingHealth = false;

async function performHealthCheck(): Promise<void> {
  const now = Date.now();
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
  } catch (err) {
    healthStatusCache.isHealthy = false;
    healthStatusCache.lastCheckedAt = now;
  } finally {
    isCheckingHealth = false;
  }
}

async function checkSystemHealth(): Promise<boolean> {
  const now = Date.now();
  // Return cached result if fresh
  if (now - healthStatusCache.lastCheckedAt < HEALTH_CACHE_TTL_MS) {
    return healthStatusCache.isHealthy;
  }

  // If already tracking health asynchronously, return the last known value
  if (isCheckingHealth) {
    return healthStatusCache.isHealthy;
  }

  isCheckingHealth = true;

  // Fire and forget (Stale-While-Revalidate)
  performHealthCheck().catch(console.error);

  // Return true by default on first load (optimistic) or stale cached value
  return healthStatusCache.isHealthy;
}

export async function getAdminNotificationCounts(): Promise<AdminNotifications> {
  try {
    const pendingUsers = 0;

    let systemIssues = 0;
    try {
      const isHealthy = await checkSystemHealth();
      if (!isHealthy) systemIssues = 1;
    } catch (e) {
      systemIssues = 1;
    }

    return {
      pendingUsers,
      systemIssues,
    };
  } catch (error) {
    console.error("Failed to fetch admin notifications:", error);
    return {
      pendingUsers: 0,
      systemIssues: 0,
    };
  }
}
