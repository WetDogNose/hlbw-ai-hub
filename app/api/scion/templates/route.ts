import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const getScionPath = () => {
  // Default assumes hlbw-ai-hub and ai-organisation-engine are siblings
  return path.join(process.cwd(), '../ai-organisation-engine/.scion/templates');
};

export async function GET() {
  try {
    const templatesPath = getScionPath();
    const files = await fs.readdir(templatesPath);
    
    const templates = await Promise.all(
      files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).map(async (fileName) => {
        const content = await fs.readFile(path.join(templatesPath, fileName), 'utf-8');
        return { name: fileName, content };
      })
    );

    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, content } = await request.json();
    if (!name || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing name or content' }, { status: 400 });
    }

    const templatesPath = getScionPath();
    const filePath = path.join(templatesPath, name);
    
    // Ensure we don't traverse out of the templates directory
    if (!filePath.startsWith(templatesPath)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
