import { NextRequest, NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [activeSetting, history] = await Promise.all([
      prisma.appearanceSetting.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.appearanceSetting.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    if (!activeSetting && history.length === 0) {
      // Create initial settings
      const initialSetting = await prisma.appearanceSetting.create({
        data: {
          isActive: true,
        },
      });
      return NextResponse.json({
        active: initialSetting,
        history: [initialSetting],
      });
    }

    // Safety fallback: ensure we always return SOMETHING for active so the SWR client doesn't hang
    const safeActive = activeSetting || history[0];
    if (!safeActive) {
      // Extreme edge case fallback where the DB might be in a bad state
      const initialSetting = await prisma.appearanceSetting.create({
        data: { isActive: true },
      });
      return NextResponse.json({
        active: initialSetting,
        history: [initialSetting],
      });
    }

    return NextResponse.json({
      active: safeActive,
      history,
    });
  } catch (error) {
    console.error("Error fetching appearance settings:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getIapUser();

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    // Ensure we don't pass id or createdAt if they exist in payload
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, isActive, ...settingData } = data;

    // Transaction to disable old active settings and create the new one
    const newSetting = await prisma.$transaction(async (tx) => {
      await tx.appearanceSetting.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });

      return tx.appearanceSetting.create({
        data: {
          ...settingData,
          isActive: true,
        },
      });
    });

    // Cleanup history: keep only top 10
    const allSettings = await prisma.appearanceSetting.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (allSettings.length > 10) {
      const idsToDelete = allSettings.slice(10).map((s) => s.id);
      await prisma.appearanceSetting.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return NextResponse.json({ success: true, setting: newSetting });
  } catch (error) {
    console.error("Error saving appearance setting:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
