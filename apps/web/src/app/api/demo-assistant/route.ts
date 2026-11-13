import { NextRequest, NextResponse } from 'next/server';
import { DEMO_PRODUCTS } from '@/lib/demo-products';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured' }, { status: 503 });
  }

  let message = '';
  try {
    const body = await req.json();
    message = typeof body?.message === 'string' ? body.message.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const catalog = DEMO_PRODUCTS.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    priceBDT: p.basePrice,
    description: p.description,
  }));

  const prompt = [
    'You are a helpful e-commerce shopping assistant for AI Commerce.',
    'Recommend up to 3 relevant products ONLY from the catalog below based on the user request.',
    'Respond with valid JSON in this exact shape: {"reply": "short helpful message", "productSlugs": ["slug-1"]}.',
    `Catalog: ${JSON.stringify(catalog)}`,
    `User request: ${message}`,
  ].join('\n');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({ error: 'Gemini request failed', detail: errText }, { status: 502 });
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(rawText) as { reply?: string; productSlugs?: string[] };
    const slugs = Array.isArray(parsed.productSlugs) ? parsed.productSlugs : [];
    const products = DEMO_PRODUCTS.filter((p) => slugs.includes(p.slug)).slice(0, 3);

    return NextResponse.json({
      reply: parsed.reply || 'Here are some recommendations for you:',
      products,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Assistant error' }, { status: 502 });
  }
}
