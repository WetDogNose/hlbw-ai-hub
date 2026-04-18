import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      let counter = 0;
      const interval = setInterval(() => {
        controller.enqueue(`data: {"output": "Agent debug line ${counter}: Checking file descriptors..."}\n\n`);
        counter++;
        if (counter > 15) {
          clearInterval(interval);
          controller.close();
        }
      }, 800);
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
