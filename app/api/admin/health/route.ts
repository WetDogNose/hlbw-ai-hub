import { NextResponse } from "next/server";
import { getIapUser } from "@/lib/iap-auth";
import prisma from "@/lib/prisma";
import { Storage } from "@google-cloud/storage";
import { GoogleGenerativeAI } from "@google/generative-ai";
import nodemailer from "nodemailer";

export async function GET(request: Request) {
  try {
    const userRole = await getIapUser();
    if (userRole !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const service = searchParams.get("service");

    switch (service) {
      case "database": {
        try {
          await prisma.$queryRaw`SELECT 1`;
          return NextResponse.json({
            status: "ok",
            message: "Database is reachable.",
          });
        } catch (e: any) {
          return NextResponse.json({
            status: "error",
            error: e.message || "Database connection failed",
          });
        }
      }

      case "storage": {
        try {
          const storage = new Storage();
          const bucketName = process.env.GCS_BUCKET_NAME;
          if (!bucketName) {
            return NextResponse.json({
              status: "error",
              error: "GCS_BUCKET_NAME is not configured",
            });
          }
          const [exists] = await storage.bucket(bucketName).exists();
          if (exists) {
            return NextResponse.json({
              status: "ok",
              message: `Bucket ${bucketName} exists.`,
            });
          } else {
            return NextResponse.json({
              status: "error",
              error: `Bucket ${bucketName} does not exist.`,
            });
          }
        } catch (e: any) {
          return NextResponse.json({
            status: "error",
            error: e.message || "Storage connection failed",
          });
        }
      }

      case "email": {
        try {
          if (!process.env.SMTP_URL) {
            return NextResponse.json({
              status: "error",
              error: "SMTP_URL is not configured",
            });
          }
          const transporter = nodemailer.createTransport(process.env.SMTP_URL);
          await transporter.verify();
          return NextResponse.json({
            status: "ok",
            message: "SMTP server is reachable.",
          });
        } catch (e: any) {
          return NextResponse.json({
            status: "error",
            error: e.message || "Email connection failed",
          });
        }
      }

      case "ai": {
        try {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            return NextResponse.json({
              status: "error",
              error: "GEMINI_API_KEY is not configured",
            });
          }
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-8b",
          });
          await model.generateContent("hello");
          return NextResponse.json({
            status: "ok",
            message: "Gemini AI API is reachable.",
          });
        } catch (e: any) {
          return NextResponse.json({
            status: "error",
            error: e.message || "AI connection failed",
          });
        }
      }

      default:
        return NextResponse.json(
          { status: "error", error: "Unknown service" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json(
      { status: "error", error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
